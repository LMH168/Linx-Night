"""对截图做客观检查：是不是黑屏、有没有结构、亮度分布是否合理。"""
import sys
from PIL import Image, ImageStat

path = sys.argv[1]
img = Image.open(path).convert('RGB')
w, h = img.size
stat = ImageStat.Stat(img)
lum = img.convert('L')
lstat = ImageStat.Stat(lum)

pixels = list(lum.getdata())
total = len(pixels)
near_black = sum(1 for p in pixels if p < 8) / total
near_white = sum(1 for p in pixels if p > 250) / total
colors = len(set(img.getdata()))

# 分区亮度：中心（桌面）应当比四角亮
def region_lum(box):
    return ImageStat.Stat(lum.crop(box)).mean[0]

cx, cy = w // 2, int(h * 0.62)
center = region_lum((cx - w // 8, cy - h // 12, cx + w // 8, cy + h // 12))
top = region_lum((0, 0, w, h // 6))
bottom = region_lum((0, int(h * 0.86), w, h))
left = region_lum((0, 0, w // 8, h))
right = region_lum((int(w * 0.875), 0, w, h))

print(f"size           {w}x{h}")
print(f"mean RGB       {[round(v, 1) for v in stat.mean]}")
print(f"mean luma      {round(lstat.mean[0], 1)}")
print(f"luma stddev    {round(lstat.stddev[0], 1)}")
print(f"near-black %   {near_black * 100:.2f}")
print(f"near-white %   {near_white * 100:.2f}")
print(f"distinct colors {colors}")
print(f"luma center    {center:.1f}")
print(f"luma top       {top:.1f}")
print(f"luma bottom    {bottom:.1f}")
print(f"luma left      {left:.1f}")
print(f"luma right     {right:.1f}")

verdict = []
if lstat.mean[0] < 6:
    verdict.append('近乎全黑（渲染可能失败）')
if near_black > 0.85:
    verdict.append('85% 以上像素接近纯黑')
if lstat.stddev[0] < 8:
    verdict.append('亮度方差极低（画面近乎单色）')
if colors < 500:
    verdict.append(f'颜色数过少（{colors}）')
if not verdict:
    verdict.append('有内容：亮度分层与颜色数量正常')
print('verdict        ' + '; '.join(verdict))

print('\n4x4 亮度网格（行=上到下，列=左到右）')
for row in range(4):
    cells = []
    for col in range(4):
        box = (w * col // 4, h * row // 4, w * (col + 1) // 4, h * (row + 1) // 4)
        cells.append(f'{ImageStat.Stat(lum.crop(box)).mean[0]:6.1f}')
    print('  ' + ' '.join(cells))

