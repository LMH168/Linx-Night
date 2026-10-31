from pathlib import Path

OUT = Path('apps/client-vue/public/characters')
AV = OUT / 'avatars'
FB = OUT / 'full-body'
AV.mkdir(parents=True, exist_ok=True)
FB.mkdir(parents=True, exist_ok=True)

characters = [
    ('01', '雾松', '狼人', '#b68a5a', '#2b211d', '#d9b78a', '狼', 'M', '长发猎人'),
    ('02', '月桂', '预言家', '#8e9b7a', '#26342d', '#d8c48e', '月', 'F', '月桂女巫'),
    ('03', '烬灯', '女巫', '#c0785f', '#302027', '#e0b27a', '药', 'F', '篝火药师'),
    ('04', '鹿鸣', '猎人', '#8c765f', '#22332f', '#d4b17a', '弓', 'M', '林间猎手'),
    ('05', '松果', '守卫', '#6e8b83', '#1d2b2d', '#b7c59a', '盾', 'M', '松林守卫'),
    ('06', '白露', '村民', '#b78e91', '#35272c', '#e2c49b', '灯', 'F', '木屋旅人'),
    ('07', '鸦影', '狼人', '#756a8c', '#211e2e', '#c3a7c9', '鸦', 'M', '鸦羽旅客'),
    ('08', '霜枝', '村民', '#8299a2', '#1f2b34', '#c9d6c1', '枝', 'F', '雪线采集者'),
    ('09', '栗火', '村民', '#b5774f', '#34241e', '#e3bb7b', '火', 'M', '壁炉看守'),
    ('10', '星苔', '预言家', '#758a67', '#253126', '#d0bd86', '星', 'F', '苔原观星者'),
]

def bg(c):
    return f'''<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="{c[3]}"/><stop offset="1" stop-color="#090d0b"/></linearGradient>
  <radialGradient id="halo"><stop stop-color="{c[2]}" stop-opacity=".34"/><stop offset="1" stop-color="{c[3]}" stop-opacity="0"/></radialGradient>
  <linearGradient id="coat" x1="0" y1="0" x2="1" y2="1"><stop stop-color="{c[1]}"/><stop offset="1" stop-color="#101615"/></linearGradient>
  <filter id="grain"><feTurbulence baseFrequency=".8" numOctaves="2" stitchTiles="stitch"/></filter>
</defs>'''

def forest(c, w, h):
    return f'''<rect width="{w}" height="{h}" fill="url(#bg)"/><circle cx="{w*.58}" cy="{h*.36}" r="{min(w,h)*.36}" fill="url(#halo)"/>
<path d="M0 {h*.28}L{w*.13} {h*.05}l{w*.08} {h*.23}L{w*.31} {h*.1}l{w*.12} {h*.24}L{w*.55} {h*.04}l{w*.1} {h*.27}L{w*.82} {h*.12}l{w*.18} {h*.21}V0H0Z" fill="#101b16" opacity=".86"/>
<path d="M0 {h*.82}Q{w*.2} {h*.7} {w*.46} {h*.81}T{w} {h*.76}V{h}H0Z" fill="#0a100d"/><rect width="{w}" height="{h}" filter="url(#grain)" opacity=".035"/>
<path d="M{w*.12} {h*.08}v{h*.24}M{w*.88} {h*.12}v{h*.25}" stroke="{c[2]}" opacity=".32"/>'''

def face(c, cx, cy, r):
    hair = '#171917' if c[0] in {'雾松','鸦影'} else c[1]
    eye = c[2]
    return f'''<circle cx="{cx}" cy="{cy}" r="{r}" fill="#c28f72"/>
<path d="M{cx-r*1.05} {cy-r*.1}Q{cx-r*.8} {cy-r*1.3} {cx} {cy-r*1.08}Q{cx+r*.8} {cy-r*1.3} {cx+r*1.05} {cy-r*.05}L{cx+r*.76} {cy-r*.3}Q{cx} {cy-r*.65} {cx-r*.76} {cy-r*.3}Z" fill="{hair}"/>
<path d="M{cx-r*.62} {cy+r*.05}q{r*.22} {r*.15} {r*.43} 0M{cx+r*.2} {cy+r*.05}q{r*.22} {r*.15} {r*.43} 0" stroke="{eye}" stroke-width="{max(1.2,r*.07)}" fill="none" stroke-linecap="round"/>
<path d="M{cx-r*.08} {cy+r*.13}l{r*.03} {r*.18}m{-r*.14} {r*.12}q{r*.15} {r*.1} {r*.3} 0" stroke="#694c42" stroke-width="{max(1,r*.04)}" fill="none" stroke-linecap="round"/>
<path d="M{cx-r*.78} {cy+r*.55}Q{cx} {cy+r*.93} {cx+r*.78} {cy+r*.55}" stroke="#5d423b" stroke-width="{max(1,r*.055)}" fill="none" opacity=".65"/>'''

def avatar(c):
    code,name,role,accent,dark,light,mark,gender,subtitle = c
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320" role="img" aria-labelledby="title desc">
<title id="title">{name} · {role}</title><desc id="desc">暮林山舍角色头像：{subtitle}</desc>{bg(c)}{forest(c,320,320)}
<circle cx="160" cy="150" r="105" fill="none" stroke="{light}" stroke-opacity=".24"/><path d="M49 302Q75 204 160 202t111 100" fill="url(#coat)" stroke="{light}" stroke-opacity=".22"/>{face(c,160,145,59)}
<path d="M92 247q68 28 136 0" stroke="{accent}" stroke-width="3" opacity=".6"/><circle cx="270" cy="54" r="23" fill="#0a100d" stroke="{light}" stroke-opacity=".4"/><text x="270" y="62" text-anchor="middle" fill="{light}" font-family="serif" font-size="18">{mark}</text>
<text x="24" y="286" fill="{light}" font-family="serif" font-size="21" letter-spacing="4">{name}</text><text x="26" y="306" fill="{light}" opacity=".55" font-family="sans-serif" font-size="8" letter-spacing="2">{role.upper()} · SCENE {code}</text></svg>'''

def fullbody(c):
    code,name,role,accent,dark,light,mark,gender,subtitle = c
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 720" role="img" aria-labelledby="title desc">
<title id="title">{name} · {role} · {subtitle}</title><desc id="desc">暮林山舍风格全身角色立绘</desc>{bg(c)}{forest(c,480,720)}
<path d="M72 680Q91 489 163 418h154q72 71 91 262" fill="url(#coat)" stroke="{light}" stroke-opacity=".28" stroke-width="2"/>
<path d="M185 429l-25 222h56l24-158 24 158h56l-25-222" fill="#111918" opacity=".85"/>
{face(c,240,254,77)}<path d="M155 363Q240 421 325 363l-12 82q-73 45-146 0Z" fill="{accent}" opacity=".75"/>
<path d="M124 464Q80 508 70 615M356 464q44 44 54 151" stroke="{accent}" stroke-width="14" opacity=".7" fill="none" stroke-linecap="round"/>
<path d="M111 615l-20 62h96l-8-62M293 615l-8 62h96l-20-62" fill="#0a100d" stroke="{light}" stroke-opacity=".25"/>
<circle cx="397" cy="76" r="30" fill="#0a100d" stroke="{light}" stroke-opacity=".45"/><text x="397" y="86" text-anchor="middle" fill="{light}" font-family="serif" font-size="24">{mark}</text>
<text x="30" y="637" fill="{light}" font-family="serif" font-size="31" letter-spacing="6">{name}</text><text x="33" y="663" fill="{light}" opacity=".62" font-family="sans-serif" font-size="11" letter-spacing="3">{role.upper()} · {subtitle.upper()}</text><path d="M33 684h130" stroke="{accent}" stroke-width="2"/></svg>'''

for c in characters:
    code = c[0]
    (AV / f'{code}-{c[1]}.svg').write_text(avatar(c), encoding='utf-8')
    (FB / f'{code}-{c[1]}.svg').write_text(fullbody(c), encoding='utf-8')

manifest = ['# 暮林山舍角色资产', '', '每个角色包含 `avatars/` 头像和 `full-body/` 全身立绘，均为可缩放 SVG，适合 Vue UI 直接引用。', '', '| 编号 | 名称 | 身份原型 | 头像 | 全身 |', '|---|---|---|---|---|']
for c in characters:
    manifest.append(f'| {c[0]} | {c[1]} | {c[2]} | `{c[0]}-{c[1]}.svg` | `{c[0]}-{c[1]}.svg` |')
(OUT / 'README.md').write_text('\n'.join(manifest) + '\n', encoding='utf-8')
