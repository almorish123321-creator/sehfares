import os
import struct

def get_image_info(filepath):
    with open(filepath, 'rb') as f:
        head = f.read(24)
        if head.startswith(b'\x89PNG\r\n\x1a\n'):
            check = struct.unpack('>I', head[8:12])[0]
            if check == 0x49484452:
                width, height = struct.unpack('>II', head[16:24])
                return width, height
        elif head.startswith(b'\xff\xd8'):
            # JPEG is harder, let's just use PIL if we can, or skip
            pass
    return None, None

folder = r"C:\Users\Zakarya\.gemini\antigravity\scratch\seha-sickleave-app\متطلبات المشروع"
for filename in os.listdir(folder):
    if filename.endswith(".png") or filename.endswith(".jpg"):
        filepath = os.path.join(folder, filename)
        size = os.path.getsize(filepath)
        w, h = get_image_info(filepath)
        print(f"{filename} | {size} bytes | {w}x{h}")
