# Génère rsrc_windows_amd64.syso : icône + informations de version + manifeste
import struct, sys, re
VER = sys.argv[1] if len(sys.argv) > 1 else '1.0.0'
ico = open('app/icon.ico', 'rb').read()
_, _, n = struct.unpack('<HHH', ico[:6])
imgs = []
for i in range(n):
    w, h, c, r, pl, bc, sz, off = struct.unpack('<BBBBHHII', ico[6+16*i:22+16*i])
    imgs.append((w, h, c, r, pl, bc, ico[off:off+sz]))
grp = struct.pack('<HHH', 0, 1, n) + b''.join(struct.pack('<BBBBHHIH', w, h, c, r, pl, bc, len(d), i+1) for i, (w, h, c, r, pl, bc, d) in enumerate(imgs))

def u16(s): return s.encode('utf-16-le')
def pad4(b): return b + b'\0' * ((-len(b)) % 4)
def block(key, value=b'', vlen=0, typ=0, children=()):
    head = struct.pack('<HHH', 0, vlen, typ) + u16(key) + b'\0\0'
    body = pad4(head) + (pad4(value) if value else b'')
    kids = b''
    for i, k in enumerate(children):
        kids += pad4(k) if i < len(children) - 1 else k
    full = body + kids
    return struct.pack('<H', len(full)) + full[2:]
parts = [int(x) for x in re.findall(r'\d+', VER)][:3] + [0]
parts = (parts + [0, 0, 0, 0])[:4]
fixed = struct.pack('<IIIIIIIIIIIII', 0xFEEF04BD, 0x10000, (parts[0] << 16) | parts[1], (parts[2] << 16) | parts[3], (parts[0] << 16) | parts[1], (parts[2] << 16) | parts[3], 0x3f, 0, 0x40004, 1, 0, 0, 0)
strings = [('CompanyName', 'N4ssD'), ('FileDescription', 'Arcade - lanceur de jeux'), ('FileVersion', VER), ('InternalName', 'Arcade'),
           ('LegalCopyright', '(c) N4ssD'), ('OriginalFilename', 'Arcade.exe'), ('ProductName', 'Arcade'), ('ProductVersion', VER)]
st = block('040904B0', children=[block(k, u16(v) + b'\0\0', len(v) + 1, 1) for k, v in strings])
sfi = block('StringFileInfo', typ=1, children=[st])
vfi = block('VarFileInfo', typ=1, children=[block('Translation', struct.pack('<HH', 0x409, 0x4B0), 4, 0)])
version = block('VS_VERSION_INFO', fixed, 52, 0, [sfi, vfi])
manifest = b'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0"><assemblyIdentity version="1.0.0.0" processorArchitecture="amd64" name="N4ssD.Arcade" type="win32"/><description>Arcade</description><trustInfo xmlns="urn:schemas-microsoft-com:asm.v3"><security><requestedPrivileges><requestedExecutionLevel level="asInvoker" uiAccess="false"/></requestedPrivileges></security></trustInfo><compatibility xmlns="urn:schemas-microsoft-com:compatibility.v1"><application><supportedOS Id="{8e0f7a12-bfb3-4fe8-b9a5-48fd50a15a9a}"/><supportedOS Id="{1f676c76-80e1-4239-95bb-83d0f6d0da78}"/></application></compatibility></assembly>'''
tree = {3: [(i+1, d[-1]) for i, d in enumerate(imgs)], 14: [(1, grp)], 16: [(1, version)], 24: [(1, manifest)]}
def align(x): return (x + 3) & ~3
types = sorted(tree)
# tailles
root_sz = 16 + 8*len(types)
off = root_sz
type_off = {}
for t in types: type_off[t] = off; off += 16 + 8*len(tree[t])
lang_off = {}
for t in types:
    for nm, _ in tree[t]: lang_off[(t, nm)] = off; off += 16 + 8
dent_off = {}
for t in types:
    for nm, _ in tree[t]: dent_off[(t, nm)] = off; off += 16
blob = align(off); p = blob; data_off = {}
for t in types:
    for nm, d in tree[t]: data_off[(t, nm)] = p; p = align(p + len(d))
sec = bytearray(p)
def dirhdr(o, nid): struct.pack_into('<IIHHHH', sec, o, 0, 0, 0, 0, 0, nid)
dirhdr(0, len(types))
for i, t in enumerate(types): struct.pack_into('<II', sec, 16+8*i, t, 0x80000000 | type_off[t])
relocs = []
for t in types:
    dirhdr(type_off[t], len(tree[t]))
    for i, (nm, d) in enumerate(tree[t]):
        struct.pack_into('<II', sec, type_off[t]+16+8*i, nm, 0x80000000 | lang_off[(t, nm)])
        lo = lang_off[(t, nm)]; dirhdr(lo, 1); struct.pack_into('<II', sec, lo+16, 0x0409, dent_off[(t, nm)])
        de = dent_off[(t, nm)]; struct.pack_into('<IIII', sec, de, data_off[(t, nm)], len(d), 0, 0); relocs.append(de)
        sec[data_off[(t, nm)]:data_off[(t, nm)]+len(d)] = d
secoff = 20 + 40; relocoff = secoff + len(sec); symoff = relocoff + 10*len(relocs)
out = struct.pack('<HHIIIHH', 0x8664, 1, 0, symoff, 1, 0, 0)
out += struct.pack('<8sIIIIIIHHI', b'.rsrc', 0, 0, len(sec), secoff, relocoff, 0, len(relocs), 0, 0x40000040)
out += bytes(sec)
for r in relocs: out += struct.pack('<IIH', r, 0, 3)
out += struct.pack('<8sIhHBB', b'.rsrc', 0, 1, 0, 3, 0) + struct.pack('<I', 4)
open('rsrc_windows_amd64.syso', 'wb').write(out)
print('syso', len(out), 'version', VER)
