from PIL import Image, ImageDraw

def make_icon(size, path, maskable=False):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    bg = (15, 92, 79, 255)
    pad = int(size * 0.06) if maskable else 0
    d.rounded_rectangle([pad, pad, size - pad, size - pad], radius=int(size * 0.18), fill=bg)

    # Karton/Box
    box_w, box_h = size * 0.5, size * 0.4
    box_x, box_y = size * 0.25, size * 0.34
    box_color = (232, 179, 109, 255)
    d.rectangle([box_x, box_y, box_x + box_w, box_y + box_h], fill=box_color)
    flap_h = box_h * 0.22
    d.polygon([
        (box_x, box_y), (box_x + box_w * 0.5, box_y - flap_h), (box_x + box_w, box_y),
    ], fill=(210, 155, 90, 255))
    d.line([box_x, box_y, box_x + box_w, box_y + box_h * 0.15], fill=(150, 105, 55, 255), width=max(1, int(size * 0.01)))
    d.line([box_x + box_w, box_y, box_x, box_y + box_h * 0.15], fill=(150, 105, 55, 255), width=max(1, int(size * 0.01)))

    # Standort-Pin oben rechts
    pin_r = size * 0.14
    pin_cx, pin_cy = size * 0.68, size * 0.28
    d.ellipse([pin_cx - pin_r, pin_cy - pin_r, pin_cx + pin_r, pin_cy + pin_r], fill=(245, 247, 250, 255))
    d.polygon([
        (pin_cx - pin_r * 0.55, pin_cy + pin_r * 0.55),
        (pin_cx + pin_r * 0.55, pin_cy + pin_r * 0.55),
        (pin_cx, pin_cy + pin_r * 1.6),
    ], fill=(245, 247, 250, 255))
    d.ellipse([pin_cx - pin_r * 0.45, pin_cy - pin_r * 0.45, pin_cx + pin_r * 0.45, pin_cy + pin_r * 0.45], fill=bg)

    img.save(path)

make_icon(192, "icons/icon-192.png")
make_icon(512, "icons/icon-512.png")
make_icon(512, "icons/icon-512-maskable.png", maskable=True)
print("done")
