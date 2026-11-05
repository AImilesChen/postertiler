from pathlib import Path
from PIL import Image, ImageChops, ImageStat
import json, math

root = Path('verification/v1.1/render')
cases = json.loads((root / 'model.json').read_text(encoding='utf-8'))
results = []
for case in cases:
    number = case['source']
    source = Image.open(root / f'source-{number}.png').convert('RGB')
    canvas = Image.new('RGB', source.size, 'white')
    g = case['geometry']
    scale = 72 / 25.4
    tiles = sorted(root.glob(f'tiles-{number}-*.png'), key=lambda p: int(p.stem.split('-')[-1]))
    assert len(tiles) == len(case['plans'])
    for tile, plan in zip(tiles, case['plans']):
        image = Image.open(tile).convert('RGB')
        left, top = round(g['margins']['left'] * scale), round(g['margins']['top'] * scale)
        right = round((g['margins']['left'] + plan['width']) * scale)
        bottom = round((g['margins']['top'] + plan['height']) * scale)
        crop = image.crop((left, top, right, bottom))
        canvas.paste(crop, (round(plan['x'] * scale), round(plan['y'] * scale)))
    canvas.save(root / f'reassembled-{number}.png')
    diff = ImageChops.difference(source, canvas)
    mae = sum(ImageStat.Stat(diff).mean) / 3
    diff.save(root / f'difference-{number}.png')
    width_error = abs(case['referenceWidthPt'] * 25.4 / 72 - g['width'])
    height_error = abs(case['referenceHeightPt'] * 25.4 / 72 - g['height'])
    passed = mae < 5 and width_error < .1 and height_error < .1
    results.append({'source_page': number, 'mean_absolute_pixel_difference': round(mae, 4), 'physical_width_error_mm': width_error,
                    'physical_height_error_mm': height_error, 'passed': passed,
                    'method': 'PDF.js source at 72dpi versus Poppler output sheets virtually reassembled; pixel tolerance allows renderer antialiasing and subpixel seams.'})
    print(f"Source {number}: mean RGB difference {mae:.4f}; physical errors {width_error:.6f}/{height_error:.6f} mm; {'PASS' if passed else 'FAIL'}")
(root / 'results.json').write_text(json.dumps(results, indent=2), encoding='utf-8')
assert all(result['passed'] for result in results), 'Vector output differs from the independently rendered source.'
