from pathlib import Path

OUT = Path('apps/client-vue/public/characters-cartoon')
AV = OUT / 'avatars'
FB = OUT / 'full-body'
AV.mkdir(parents=True, exist_ok=True)
FB.mkdir(parents=True, exist_ok=True)

# id, name, role, faction, main, accent, prop, expression, animal
characters = [
 ('01','黑爪','狼人','werewolf','#6d3fa3','#ff5c7a','月牙爪','坏笑','wolf'),
 ('02','雪牙','白狼','werewolf','#f4f2ea','#4b9cff','冰晶牙','得意','white-wolf'),
 ('03','胖熊','熊','neutral','#a9683e','#ffd34e','蜂蜜罐','憨笑','bear'),
 ('04','企鹅船长','企鹅','neutral','#263d68','#ffcf43','望远镜','惊讶','penguin'),
 ('05','泡泡','女巫','good','#713c9d','#58e6c0','魔法药瓶','俏皮','human'),
 ('06','星盘','预言家','good','#205f9e','#ffe16b','星盘','神秘','human'),
 ('07','猎风','猎人','good','#c55237','#5de0a1','短弓','兴奋','human'),
 ('08','麦穗','农夫','good','#d28b2d','#66bd4a','麦穗','灿笑','human'),
 ('09','叮当','木匠','good','#b66b38','#50c7d9','木槌','专注','human'),
 ('10','铁心','战士','good','#d34845','#7c9bff','圆盾','勇敢','human'),
 ('11','爷爷','老者','good','#6f7989','#e4b85f','拐杖','慈祥','human'),
 ('12','吱吱','拟人老鼠','good','#d88b9b','#ffe078','奶酪','狡黠','mouse'),
 ('13','小羽','小天使','good','#6ebce6','#fff0a7','星星法杖','开心','angel'),
]

STYLE = 'stroke-linejoin="round" stroke-linecap="round"'

def face(cx, cy, r, expr, skin='#ffd0a8'):
    eyes = {
      '坏笑': f'<path d="M{cx-r*.58} {cy-r*.05}l{r*.25}-.12M{cx+r*.33} {cy-r*.17}l{r*.25}-.12" {STYLE} fill="none"/><path d="M{cx-r*.48} {cy+r*.38}q{r*.48} {r*.38} {r*.9}-.04" {STYLE} fill="none"/>',
      '得意': f'<path d="M{cx-r*.58} {cy-r*.05}q{r*.22}-.18 {r*.44} 0M{cx+r*.14} {cy-r*.05}q{r*.22}-.18 {r*.44} 0" {STYLE} fill="none"/><path d="M{cx-r*.27} {cy+r*.35}q{r*.38} {r*.2} {r*.7}-.08" {STYLE} fill="none"/>',
      '憨笑': f'<circle cx="{cx-r*.3}" cy="{cy}" r="{r*.09}" fill="#171522"/><circle cx="{cx+r*.3}" cy="{cy}" r="{r*.09}" fill="#171522"/><path d="M{cx-r*.36} {cy+r*.3}q{r*.36} {r*.43} {r*.72} 0" {STYLE} fill="none"/>',
      '惊讶': f'<circle cx="{cx-r*.3}" cy="{cy}" r="{r*.11}" fill="#171522"/><circle cx="{cx+r*.3}" cy="{cy}" r="{r*.11}" fill="#171522"/><circle cx="{cx}" cy="{cy+r*.38}" r="{r*.13}" fill="#171522"/>',
      '俏皮': f'<circle cx="{cx-r*.3}" cy="{cy}" r="{r*.09}" fill="#171522"/><path d="M{cx+r*.1} {cy-r*.05}q{r*.3}-.25 {r*.52} .03" {STYLE} fill="none"/><path d="M{cx-r*.28} {cy+r*.36}q{r*.27} {r*.18} {r*.55}-.04" {STYLE} fill="none"/>',
      '神秘': f'<path d="M{cx-r*.57} {cy}h{r*.34}m{r*.23} 0h{r*.34}" {STYLE} fill="none"/><path d="M{cx-r*.3} {cy+r*.34}q{r*.32} {r*.17} {r*.64}-.03" {STYLE} fill="none"/>',
      '兴奋': f'<circle cx="{cx-r*.3}" cy="{cy}" r="{r*.09}" fill="#171522"/><circle cx="{cx+r*.3}" cy="{cy}" r="{r*.09}" fill="#171522"/><path d="M{cx-r*.36} {cy+r*.27}q{r*.37} {r*.49} {r*.74} 0" {STYLE} fill="none"/>',
      '灿笑': f'<path d="M{cx-r*.56} {cy-r*.05}q{r*.24}-.2 {r*.45} 0M{cx+r*.11} {cy-r*.05}q{r*.24}-.2 {r*.45} 0" {STYLE} fill="none"/><path d="M{cx-r*.43} {cy+r*.23}q{r*.43} {r*.55} {r*.86} 0" {STYLE} fill="none"/>',
      '专注': f'<path d="M{cx-r*.55} {cy-r*.1}h{r*.35}m{r*.2} 0h{r*.35}" {STYLE} fill="none"/><path d="M{cx-r*.23} {cy+r*.36}q{r*.24} {r*.12} {r*.48} 0" {STYLE} fill="none"/>',
      '勇敢': f'<path d="M{cx-r*.55} {cy-r*.18}q{r*.24}-.16 {r*.42} 0M{cx+r*.13} {cy-r*.18}q{r*.24}-.16 {r*.42} 0" {STYLE} fill="none"/><path d="M{cx-r*.3} {cy+r*.28}q{r*.3} {r*.22} {r*.6} 0" {STYLE} fill="none"/>',
      '慈祥': f'<path d="M{cx-r*.55} {cy}q{r*.22}-.22 {r*.42} 0M{cx+r*.13} {cy}q{r*.22}-.22 {r*.42} 0" {STYLE} fill="none"/><path d="M{cx-r*.38} {cy+r*.27}q{r*.38} {r*.28} {r*.76} 0" {STYLE} fill="none"/>',
      '狡黠': f'<path d="M{cx-r*.58} {cy-r*.15}l{r*.35}-.08M{cx+r*.12} {cy-r*.15}l{r*.38}.08" {STYLE} fill="none"/><path d="M{cx-r*.3} {cy+r*.3}q{r*.28} {r*.2} {r*.58}-.04" {STYLE} fill="none"/>',
      '开心': f'<circle cx="{cx-r*.3}" cy="{cy}" r="{r*.09}" fill="#171522"/><circle cx="{cx+r*.3}" cy="{cy}" r="{r*.09}" fill="#171522"/><path d="M{cx-r*.38} {cy+r*.26}q{r*.38} {r*.5} {r*.76} 0" {STYLE} fill="none"/>',
    }[expr]
    return f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{skin}" {STYLE}/>{eyes}'

def animal_head(animal, main, accent, cx, cy, r, expr):
    if animal in ('wolf','white-wolf'):
        ear = f'<path d="M{cx-r*.78} {cy-r*.52}L{cx-r*.63} {cy-r*1.28}L{cx-r*.12} {cy-r*.72}M{cx+r*.12} {cy-r*.72}L{cx+r*.63} {cy-r*1.28}L{cx+r*.78} {cy-r*.52}" fill="{main}" {STYLE}/>'
        return ear + f'<path d="M{cx-r*.83} {cy-r*.24}Q{cx} {cy-r*.95} {cx+r*.83} {cy-r*.24}v{r*.55}Q{cx} {cy+r*.95} {cx-r*.83} {cy+r*.31}Z" fill="{main}" {STYLE}/>' + face(cx,cy,r*.65,expr,'#ead0bd')
    if animal == 'bear':
        return f'<circle cx="{cx-r*.56}" cy="{cy-r*.58}" r="{r*.3}" fill="{main}" {STYLE}/><circle cx="{cx+r*.56}" cy="{cy-r*.58}" r="{r*.3}" fill="{main}" {STYLE}/><circle cx="{cx}" cy="{cy}" r="{r*.84}" fill="{main}" {STYLE}/>' + face(cx,cy,r*.58,expr,'#e6ac7c')
    if animal == 'penguin':
        return f'<ellipse cx="{cx}" cy="{cy}" rx="{r*.85}" ry="{r*1.05}" fill="{main}" {STYLE}/><ellipse cx="{cx}" cy="{cy+r*.15}" rx="{r*.52}" ry="{r*.66}" fill="#fff3d5"/>' + face(cx,cy,r*.55,expr,'#fff3d5')
    if animal == 'mouse':
        return f'<circle cx="{cx-r*.65}" cy="{cy-r*.62}" r="{r*.35}" fill="{main}" {STYLE}/><circle cx="{cx+r*.65}" cy="{cy-r*.62}" r="{r*.35}" fill="{main}" {STYLE}/><circle cx="{cx}" cy="{cy}" r="{r*.76}" fill="{main}" {STYLE}/>' + face(cx,cy,r*.55,expr,'#f2b4b2')
    return f'<path d="M{cx-r*.62} {cy-r*.9}l{r*.38} {r*.42}M{cx+r*.62} {cy-r*.9}l-{r*.38} {r*.42}" stroke="{main}" stroke-width="{r*.3}" {STYLE} fill="none"/>' + face(cx,cy,r*.65,expr,'#ffd0a8')

def prop(prop, cx, cy, accent):
    p = {
      '月牙爪': f'<path d="M{cx-25} {cy}q30-45 60 0" fill="none" stroke="{accent}" stroke-width="16" {STYLE}/>',
      '冰晶牙': f'<path d="M{cx-28} {cy-8}l18-35 15 38 18-29 12 39" fill="none" stroke="{accent}" stroke-width="10" {STYLE}/>',
      '蜂蜜罐': f'<rect x="{cx-30}" y="{cy-20}" width="60" height="58" rx="12" fill="#d99a35" {STYLE}/><path d="M{cx-20} {cy-5}h40" stroke="#fff0a2" stroke-width="8"/>',
      '望远镜': f'<path d="M{cx-35} {cy+22}l70-42" stroke="{accent}" stroke-width="18" {STYLE}/><circle cx="{cx-30}" cy="{cy+20}" r="17" fill="{accent}" {STYLE}/>',
      '魔法药瓶': f'<path d="M{cx-18} {cy-15}v-22h36v22l18 35q-36 24-72 0Z" fill="{accent}" {STYLE}/>',
      '星盘': f'<circle cx="{cx}" cy="{cy}" r="34" fill="none" stroke="{accent}" stroke-width="10" {STYLE}/><path d="M{cx-27} {cy+24}l54-48M{cx-27} {cy-24}l54 48" stroke="{accent}" stroke-width="7"/>',
      '短弓': f'<path d="M{cx-25} {cy-38}q55 38 0 76M{cx-25} {cy-38}q25 38 0 76" fill="none" stroke="{accent}" stroke-width="10" {STYLE}/>',
      '麦穗': f'<path d="M{cx} {cy+38}q-8-55 16-78M{cx-2} {cy-3}l-25-13M{cx+5} {cy-20}l24-14" stroke="{accent}" stroke-width="9" {STYLE} fill="none"/>',
      '木槌': f'<path d="M{cx} {cy-5}v55M{cx-30} {cy-32}h60v28h-60Z" fill="{accent}" {STYLE}/>',
      '圆盾': f'<path d="M{cx} {cy-43}l40 18v27q-8 34-40 52-32-18-40-52v-27Z" fill="{accent}" {STYLE}/>',
      '拐杖': f'<path d="M{cx-5} {cy+45}v-65q0-23 24-20" fill="none" stroke="{accent}" stroke-width="12" {STYLE}/>',
      '奶酪': f'<path d="M{cx-38} {cy-18}l62-23 34 45-61 25Z" fill="{accent}" {STYLE}/><circle cx="{cx}" cy="{cy-10}" r="7" fill="#fff3b2"/>',
      '星星法杖': f'<path d="M{cx} {cy+42}v-58" stroke="{accent}" stroke-width="9" {STYLE}/><path d="M{cx} {cy-53}l9 18 20 2-15 13 5 20-19-10-19 10 5-20-15-13 20-2Z" fill="{accent}" {STYLE}/>',
    }[prop]
    return p

def svg(c, full=False):
    code,name,role,faction,main,accent,pr,expr,animal=c
    if full:
        return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 720"><title>{name} · {role}</title><rect width="480" height="720" fill="#f6d66f"/><path d="M0 500Q110 420 240 500t240 0v220H0Z" fill="#7fc37b"/><circle cx="385" cy="95" r="55" fill="#fff0a7" opacity=".9"/><path d="M150 690q8-185 90-215h0q82 30 90 215" fill="{main}" {STYLE}/><path d="M180 470q60 42 120 0" stroke="{accent}" stroke-width="34" fill="none" {STYLE}/>{animal_head(animal,main,accent,240,250,92,expr)}{prop(pr,360,455,accent)}<path d="M108 628h92M280 628h92" stroke="#171522" stroke-width="20" stroke-linecap="round"/><text x="28" y="60" fill="#171522" font-family="sans-serif" font-size="18" font-weight="bold">SCENE {code} · {role.upper()}</text><text x="28" y="665" fill="#171522" font-family="sans-serif" font-size="38" font-weight="bold">{name}</text><text x="30" y="695" fill="#171522" font-family="sans-serif" font-size="16">{pr} · {expr}</text></svg>'''
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320"><title>{name} · {role}</title><rect width="320" height="320" rx="54" fill="#f6d66f"/><circle cx="160" cy="140" r="119" fill="{accent}" opacity=".35"/>{animal_head(animal,main,accent,160,137,74,expr)}{prop(pr,245,250,accent)}<path d="M62 267q98-55 196 0" fill="{main}" {STYLE}/><circle cx="46" cy="47" r="28" fill="#171522"/><text x="46" y="57" text-anchor="middle" fill="#fff3d5" font-family="sans-serif" font-size="22" font-weight="bold">{code}</text><text x="28" y="298" fill="#171522" font-family="sans-serif" font-size="16" font-weight="bold">{name} · {role}</text></svg>'''

for c in characters:
    (AV/f'{c[0]}.svg').write_text(svg(c), encoding='utf-8')
    (FB/f'{c[0]}.svg').write_text(svg(c, True), encoding='utf-8')

manifest = ['# 暮林山舍 · 欧美卡通角色资产', '', '粗黑手绘描边、明快块面、高饱和配色、夸张可爱比例。每个角色含 SVG 头像与全身展示图。', '', '| 编号 | 名称 | 角色 | 阵营 | 头像 | 全身 |', '|---|---|---|---|---|---|']
for c in characters:
    manifest.append(f'| {c[0]} | {c[1]} | {c[2]} | {c[3]} | `avatars/{c[0]}.svg` | `full-body/{c[0]}.svg` |')
(OUT/'README.md').write_text('\n'.join(manifest)+'\n', encoding='utf-8')
