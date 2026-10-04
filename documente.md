# ZyZ Shadows — Descobertas

## Arquitetura do ZyZGfx64 (do disassembly)
- Pipeline próprio com event bus (rq::) e wrapper GL (gl::)
- Captura seletiva de estado GL (14 hooks Sh*)
- Struct de estado em 0x162880 (208 bytes) preenchida por múltiplos hooks
- Replay dos draws no callback do evento 2 (0x83f98)

## Offsets importantes (libGTASA.so 2.00 32-bit)
- CRenderer::ms_aVisibleEntityPtrs = 0x00960b80 (array 1000 ponteiros)
- CRenderer::ms_nNoOfVisibleEntities = 0x00960b64 (int)
- CRenderer::RenderEverythingBarRoads = 0x0040fd15 (Thumb)
- CEntity::Render = 0x003ed20d (Thumb)
- CPostEffects::MobileRender = 0x005b5f09
- RenderScene = 0x003f609d
- CTimeCycle::m_VectorToSun = 0x0096b258
- CTimeCycle::m_CurrentStoredValue = 0x0096b254

## Nossos milestones
- M1 ✅ Captura de draws (288 por frame)
- M2 ✅ Batch replay (mas nada escrito)
- M3 ⏳ Inline replay por draw (travou no clear 288x)

## Próximo passo
- Dissecar hooks Sh* pequenos pra entender o padrão de captura

## Struct de 208 bytes (ZyZGfx64)
- Total: 0xd0 bytes
- Offset 0x00-0x0F: mode, count, type, indices (do draw)
- Offset 0x10-0x4F: matriz 4x4 (ProjMatrix? ViewMatrix?)
- Offset 0x50: program?
- ...


# ZyZ Shadows — Documentação de Engenharia Reversa

## Fontes analisadas
- `libZyZGfx64.so` — mod de referência (ARM64, NDK r27d, stripped)
- `libGTASA.so` — GTA SA Android 2.00 (ARM32, Thumb, com dynsym)

## Arquitetura geral do ZyZGfx64

O mod NÃO faz snapshot por draw. Ele mantém **globais que sempre
refletem o estado GL atual**. Cada hook GL atualiza a global
correspondente. O `glDrawElements` empacota as globais + args do draw
numa fila. Depois, num callback de fim de frame, o replay itera a fila.

### Globais de estado (todas em libZyZGfx64.so)

| Endereço | Tipo | Significado |
|---|---|---|
| 0x162878 | u8   | "render ativo" (setado em ShUseProgram) |
| 0x162880 | ptr  | ponteiro pro programa atual (struct 96 bytes) |
| 0x162898 | u32  | VBO atual (GL_ARRAY_BUFFER) |
| 0x16289C | u32  | IBO atual (GL_ELEMENT_ARRAY_BUFFER) |
| 0x1628A8 | arr  | array de vertex attribs (16 × 40 bytes) |
| 0x162B60 | u32  | unit de textura ativa (0 = GL_TEXTURE0) |
| 0x162B70 | u32  | textura atual (só se unit==0) |
| 0x162B88 | u32  | VAO atual |
| 0x162B98 | u8   | "estamos em shadow pass" |
| 0x162BA0 | u64  | contador A (draws no shadow) |
| 0x162BA8 | u64  | contador B (fora de condições) |
| 0x162BB0 | u64  | contador C (dentro de condições) |
| 0x162BB8 | u64  | contador D |
| 0x162BC0 | u8   | flag "processar shadow neste draw" |
| 0x162BC8 | u64  | contador E |
| 0x162BD0 | u64  | contador F |
| 0x162BD8 | u64  | contador G |
| 0x162BE0 | ptr  | ponteiro pro uniform ProjMatrix do jogo |
| 0x162BE8 | ptr  | ponteiro pro uniform ViewMatrix do jogo |
| 0x162BF0 | u64  | contador H |
| 0x162BF8 | u8   | flag (?) |
| 0x162C00 | u64  | contador I |
| 0x162C08 | u64  | contador J |
| 0x162C10 | f64  | acumulador de tempo GPU |
| 0x162C64 | arr  | hash table: program_id -> índice (u16) |
| 0x164C64 | arr  | array linear de structs de programa (96 bytes cada) |

### Struct de vertex attrib (0x1628A8, cada entrada = 40 bytes)

Capturado por `HookOf_ShVertexAttribPointer`:

| Offset | Campo | Vem de |
|---|---|---|
| 0x00 | VBO ativo (u32) | [0x162898] |
| 0x04 | size (i32) | arg1 |
| 0x08 | type (u32) | arg2 |
| 0x0C | normalized (u8) | arg3 |
| 0x10 | stride (i32) | arg4 |
| 0x14 | padding | |
| 0x18 | pointer (u64) | arg5 |
| 0x20 | flag ativo (u8) | sempre 1 |

Indexado por `attrib_index` (0..15). Se `attrib_index > 15`, ignora.

### Struct de programa (0x164C64, cada entrada = 96 bytes)

Capturado por `HookOf_ShUseProgram` (função grande, 1780 bytes).

Hash table em `0x162C64` mapeia `program_id -> índice (u16)`, com
`índice == 0` significando "não registrado".

## Descobertas relevantes

### O que o mod captura (14 hooks Sh*)
- ShDepthMask (16b) — salva em 0xD8000+0xD28
- ShBindVertexArray (52b) — salva VAO em 0x162B88
- ShActiveTexture (60b) — salva em 0x162B60 (subtrai 0x84C0 = GL_TEXTURE0)
- ShBindTexture (76b) — salva em 0x162B70 (só se unit==0 e target==GL_TEXTURE_2D)
- ShBindFramebuffer (80b) — salva em 0xD8000+0xD24
- ShBindBuffer (96b) — salva VBO em 0x162898 e IBO em 0x16289C
- ShUniformMatrix4fv (136b) — checa se é ProjMatrix ou ViewMatrix
- ShVertexAttribPointer (140b) — salva no array de attribs
- ShDeleteBuffers (140b)
- ShBufferSubData (256b)
- ShBufferData (260b)
- ShMapBufferRange (260b)
- ShDrawElements (1068b) — empacota estado e chama replay
- ShUseProgram (1780b) — gerencia structs de programa

### O que NÃO captura
- glEnable/glDisable
- glBlendFunc
- glDepthFunc
- glCullFace
- glStencilFunc
- glPolygonOffset
- glScissor

Esses estados são salvos/restaurados **uma vez por pass** (não por draw),
via o `gl::SavedState`.

## Offsets no libGTASA.so 2.00 (ARM32, Thumb)

Todos os offsets são endereços de símbolo no .so. Para chamar, é
necessário:


| Símbolo | Offset | Notas |
|---|---|---|
| CRenderer::ms_aVisibleEntityPtrs | 0x00960B80 | array de 1000 ponteiros |
| CRenderer::ms_nNoOfVisibleEntities | 0x00960B64 | int |
| CRenderer::ms_fCameraPosition | 0x00960B50 | CVector |
| CRenderer::RenderEverythingBarRoads | 0x0040FD15 | função que desenha o 3D |
| CRenderer::RenderOneNonRoad | 0x004102BD | por entidade |
| CRenderer::RenderOneRoad | 0x0040FC21 | por entidade |
| CEntity::Render | 0x003ED20D | render de uma entidade |
| CPostEffects::MobileRender | 0x005B5F09 | hook principal |
| RenderScene | 0x003F609D | render da cena |
| CTimeCycle::m_VectorToSun | 0x0096B258 | array de 24 CVector |
| CTimeCycle::m_CurrentStoredValue | 0x0096B254 | int (hora atual) |
| CShadows::StoreShadowForVehicle | 0x005B951D | sombra vanilla de veículo |
| CShadows::StoreShadowForPedObject | 0x005B9E19 | sombra vanilla de ped |

## Nossos milestones

- M1 ✅ Captura de draws (288/frame dentro do RenderEverythingBarRoads)
- M2 ✅ Batch replay (sem escrever no FBO — VBOs já trocados)
- M3 ⏳ Inline replay por draw (travou com clear 288x por frame)
- M3.5 ⏳ Re-envio de matrizes (travou com bind 288x)
- M3.6 ⏳ Clear 1x por frame (travou mesmo assim)

## Próximos passos

1. **Estudo do replay real** — dissecar o callback do evento 2 (0x83f98)
2. **Modelo mental da captura completa** — como o ShDrawElements empacota
3. **Implementar captura fiel** — manter as globais iguais ao ZyZGfx64
4. **Implementar replay eficiente** — não bindar FBO por draw
5. **Composite** — aplicar o shadow map no pipeline do jogo

## Notas

- O travamento do M3.6 foi provavelmente porque **bindamos FBO e viewport
  288x por frame**. O ZyZGfx64 bind por pass, não por draw.
- O segredo é: **durante o shadow pass, o jogo NÃO desenha na tela**.
  Ele desenha só no shadow map. Isso significa que o mod tem controle
  total do FBO durante o shadow pass — não precisa ficar alternando.
  
  ## FBOs de shadow (shadows::Install)

### Estrutura
- 2 texturas de depth (16-bit) — uma por cascata
- 2 FBOs (um anexa cada textura como GL_DEPTH_ATTACHMENT)
- Formato: GL_DEPTH_COMPONENT16
- Filtro: GL_NEAREST
- Wrap: GL_CLAMP_TO_EDGE
- Verifica GL_FRAMEBUFFER_COMPLETE antes de usar
- Detecta extension via gl::HasExtension (provável GL_EXT_shadow_samplers)

### Globais com IDs
- 0x170EA8 — textura cascata 1 (near?)
- 0x170F4C — textura cascata 2 (far?)
- 0x170EA4 — FBO cascata 1
- 0x170F54 — FBO cascata 2
- 0x170F58 — recurso auxiliar
- 0xD8000+0xD30 — tamanho do shadow map (config)

### Notas
- Usa 16-bit em vez de 24-bit → mais leve
- 2 cascatas em vez de 1 → mais qualidade (perto e longe)
- Todas as texturas são GL_TEXTURE_2D (não cubemap, não array)

## Shaders e texturas do shadows::Install (setup inicial)

### Programa de shadow
- 2 shaders compilados via `gl::Compile` (vertex + fragment)
- Linkados via `gl::Link`
- Programa guardado em `0x170F5C`

### Uniforms (14 locations, guardados em [0xD8000+0xD6C..0xD98])
Vêm de glGetUniformLocation de vários nomes (strings em .rodata).
Provavelmente incluem:
- Matriz view/proj de cada cascata
- Bias, distância, kernel PCF, etc

### Texturas adicionais
- 0x170F60 — textura com filtro GL_LINEAR
- 0x170F64 — textura com **shadow sampler** (GL_COMPARE_REF_TO_TEXTURE)
  * GL_TEXTURE_COMPARE_MODE = 0x884E
  * GL_TEXTURE_COMPARE_FUNC = 0x203 (GL_LEQUAL)
  * Isso permite PCF via hardware (sampler2DShadow)

### Log
- Ao final: "shadows instalado, NxN" (N = tamanho de [0xD8000+0xD30])


## Análise dos shaders (disassembly)

### Programas compilados pelo shadows::Install
- `[0x170F5C]` — programa principal do shadow map (depth-only)
- `[0x170CCC]` — programa 2
- `[0x170F48]` — programa 3
- `[0x170EB0]` — programa 4
- `[0x170EA4/F54/F58]` — outros recursos

Provavelmente são: shadow map, blur, composite, debug.

### Texturas adicionais
- `0x170F60` — textura com filtro GL_LINEAR
- `0x170F64` — textura com shadow sampler (GL_COMPARE_REF_TO_TEXTURE)

### Uniforms (14+ locations em [0xD8000+0xD58..0xD98])
Incluem matrizes de cada cascata, bias, kernel PCF, etc.

### Descoberta importante (o segredo do replay)
O ZyZGfx64 NÃO faz replay per-draw com bind/unbind do FBO.
Ele faz o seguinte:
  1. Mantém globais que refletem estado GL (VBO, IBO, attribs, programa, etc)
  2. Cada hook atualiza sua global
  3. glDrawElements: empacota args do draw + snapshot das globais numa lista
  4. No fim do frame (callback evento 2):
     - Bind shadow FBO 1x
     - Viewport 1x
     - Clear 1x
     - Para cada snapshot: re-arma VBO/IBO/attribs/programa + draw
     - Restaura 1x

Por isso ele NÃO trava: só 1 bind de FBO por pass, não 288.

### Por que nosso M3 travou
Fazíamos bind/unbind de FBO + viewport 288x por frame.
Em mobile, bind de FBO causa pipeline flush da GPU. 288 flushes/frame = freeze.

### Correção
Implementar batch replay COM captura de VBO/IBO/attribs.


## M4-A — Captura de VBO/IBO (19:35)

### Resultados
- ~130-220 draws capturados por frame dentro do RenderEverythingBarRoads
- mode = GL_TRIANGLE_STRIP (0x5) na maioria
- type = GL_UNSIGNED_SHORT (0x1403) — índices de 16 bits
- VBO e IBO têm valores válidos (não-zero)
- Programa ativo é capturado (mas geralmente o mesmo por frame)

### Descoberta importante
O jogo usa **1 VBO grande** e **1 IBO grande** pra todos os draws.
Cada draw varia só:
- `indices` pointer (offset dentro do IBO)
- `count` (quantos índices ler)

Isso simplifica MUITO o replay — não precisa trocar VBO/IBO entre draws.

### Estrutura atual de CapturedDraw
```c
struct CapturedDraw {
    unsigned  mode;
    int       count;
    unsigned  type;
    uintptr_t indices;
    unsigned  vbo;
    unsigned  ibo;
    unsigned  program;
};

## M4-B — Captura de attribs (19:39)

### Formato de vértice detectado

**Variante A (stride=40, prog=102):**
- attrib[0]: size=3 FLOAT → POSITION
- attrib[1]: size=2 FLOAT → UV
- attrib[2]: size=3 FLOAT → NORMAL  
- attrib[4]: size=3 UNSIGNED_BYTE norm → COLOR
- attrib[5]: size=3 UNSIGNED_BYTE → COLOR

**Variante B (stride=24, prog=200):**
- attrib[0]: size=3 FLOAT → POSITION
- attrib[1]: size=2 SHORT → UV
- attrib[3]: size=4 UNSIGNED_BYTE norm → COLOR RGBA
- attrib[6]: size=4 UNSIGNED_BYTE norm → COLOR

### Comportamento
- VBO/programa TROCAM entre draws (não é 1 pra tudo)
- Pointer dos attribs são offsets DENTRO do VBO (ex: 0x0, 0xC, 0x18)
- 130-540 draws capturados por frame

### Estrutura completa de CapturedDraw
```c
struct CapturedDraw {
    unsigned mode;
    int count;
    unsigned type;
    uintptr_t indices;   // offset no IBO
    unsigned vbo;
    unsigned ibo;
    unsigned program;
    int numAttribs;
    AttribState attribs[16];
};

## M5 — Batch replay com attribs ✅ (19:43)

### RESULTADO: FUNCIONOU!
[Replay] bloco 16x16 central: min=0x00 nonEmpty=256/256
Antes (M3.6): nonEmpty=0/256
Agora (M5):   nonEmpty=256/256

### O que foi feito
1. Captura de draws: mode, count, type, indices, vbo, ibo, program
2. Captura de attribs: para cada um dos 16 attribs (size, type, norm, stride, pointer, vbo, enabled)
3. Snapshot por draw: atribui snapshot de atribs ativos ao CapturedDraw
4. Batch replay: bind shadow FBO 1x, viewport 1x, clear 1x
5. Re-aplicação: usa p_UseProgram/p_BindBuffer/p_VertexAttribPointer/p_EnableAttrib/p_DrawElements
   (ponteiros brutos, não os hooks)

### Por que funcionou agora e não antes
- ANTES (M3.6): bind FBO 288x → travava
- AGORA (M5): bind FBO 1x → roda liso
- A diferença é só a ordem: bateria de setup 1x, depois loop de replay

### Estado atual
- A geometria do jogo é renderizada no shadow FBO
- Mas usa a matriz da CÂMERA (não da luz) → min=0x00 (tudo próximo)
- Próximo: substituir ProjMatrix/ViewMatrix pela matriz da luz durante replay

### Estrutura de CapturedDraw (completa)
```c
struct CapturedDraw {
    unsigned  mode;
    int       count;
    unsigned  type;
    uintptr_t indices;
    unsigned  vbo;
    unsigned  ibo;
    unsigned  program;
    int       numAttribs;      // 0-16
    AttribState attribs[16];   // snapshot
};

struct AttribState {
    int       index;
    int       size;
    unsigned  type;
    unsigned char normalized;
    int       stride;
    uintptr_t pointer;
    unsigned  vbo;
    bool      enabled;
};



## 🎯 M6 — Matriz da luz (próximo passo)

Agora a gente re-adiciona o hook de `glUniformMatrix4fv` e substitui Proj/View durante o replay. Manda:

**1.** Confirma que o jogo rodou liso e sem glitch.
**2.** Salva o `documentacao.md` com a seção M5.
**3.** Faz backup do projeto (isso tá funcionando, precisa preservar).

Depois disso, eu te mando o M6. **Não vamos quebrar o M5** — vamos fazer uma cópia do projeto e evoluir por cima. Se o M6 der errado, volta pro M5. 🎯


## M5 ✅ CONFIRMADO PELO USUÁRIO
Jogo rodou liso, sem glitch, sem travar.
Shadow FBO com geometria.

## Descoberta crítica — Como o jogo seta as matrizes (20:14)

### Padrão universal dos shaders do GTA SA 2.00

Cada programa de render tem 3 matrizes, SEMPRE nos mesmos locations:

| Location | Uniform | Setada quando? |
|---|---|---|
| loc=0 | ProjMatrix | 1x por programa (fora do RenderEverything) |
| loc=1 | ViewMatrix | 1x por programa (fora do RenderEverything) |
| loc=2 | ObjMatrix  | 1x por draw (dentro do RenderEverything) |

### Evidência do log


[U4] prog=7 loc=0 inRE=0 | [2.41 0 0 0 / 0 5.36 0 0 / 0 0 -1 -1 / 0 0 -1.80 0]  ← Proj
[U4] prog=7 loc=1 inRE=0 | [-1 0 0 0 / 0 1 0 0 / 0 0 -1 0 / 0 0 0 1]              ← View
[U4] prog=7 loc=2 inRE=1 | [1 0 0 0 / 0 1 0 0 / 0 0 1 0 / 2193 -1543 9.7 1]     ← Obj

```

O `inRE=0` confirma: Proj/View são setadas **antes** do RenderEverythingBarRoads começar.
O `inRE=1` no loc=2 confirma: ObjMatrix é setada **durante** o render (por draw).

### Por que o programa 200 parecia "não ter" ProjMatrix/ViewMatrix

Porque nosso hook `glGetUniformLocation` **não interceptou** o registro dele — ele já tinha
sido registrado antes do nosso mod carregar, ou usa location fixa (sem GetUniformLocation).

Mas as MATRIZES sempre foram enviadas via `glUniformMatrix4fv` nos locs 0 e 1.

### Solução definitiva (M8)

**Salvar TODAS as matrizes** que o jogo envia, indexadas por `(program, location)`.
No replay, reenviar todas, **substituindo loc=0 e loc=1 pelas matrizes da luz**.
loc=2+ (ObjMatrix) mantém do jogo.

Isso é exatamente o que o ZyZGfx64 faz com o hook `ShUniformMatrix4fv`
(que vimos: salvava 64 bytes num slot por programa).

### Estrutura nova (M8)

```c
struct MatrixSlot {
    unsigned program;
    int      location;   // 0=Proj, 1=View, 2=Obj, ...
    float    matrix[16];
};
static MatrixSlot g_slots[MAX_SLOTS];   // 2048 slots
```

Populado em glUniformMatrix4fv_Cap (captura TUDO, dentro e fora do RE).
Usado em RunShadowReplay ao trocar de programa.

```markdown
## M8 — Slots de matrizes + filtro de efeitos (20:34)

### Estrutura nova
```c
struct MatrixSlot {
    unsigned program;
    int      location;
    float    matrix[16];
};
```

Populado em glUniformMatrix4fv_Cap: salva TUDO que o jogo envia, por (program, location).

Descoberta: dois tipos de programa

Programa 3D (cena):

· Tem slot loc=0 (ProjMatrix)
· Tem slot loc=1 (ViewMatrix)
· Tem slot loc=2 (ObjMatrix, muda por draw)
· Exemplos: 1, 4, 7, 23, 71, 89, 102

Programa de efeito:

· Tem só slot loc=0 (que contém MVP já calculada na CPU)
· Tem 0 active uniforms
· Exemplo: 200 (dominante — 78% dos draws)
· Não deve ir pro shadow map

Como filtrar

ProgramIsScene3D(prog) = true se tem slot loc=0 E loc=1.

Filtros que NÃO funcionaram

· glGetProgramiv(GL_ACTIVE_UNIFORMS) — retornou 0 pra todos (bug)
· HasMatrixSlot(loc=0) — todos têm (até efeitos)

Filtro correto

Checar slots loc=0 E loc=1 simultaneamente.

Substituição da matriz no replay

Pra programas 3D: substitui loc=0 (ProjMatrix) pela MVP da luz:

```
MVP_luz = lightProj * lightView * objMatrix
```

Onde objMatrix é o valor que o jogo enviou pra loc=0 originalmente.

Nota: o jogo envia ObjMatrix pura em loc=0 (não MVP combinada). Foi
por isso que substituir por identidade/tiny não fez diferença — a matriz
de objeto era ignorada.


 Achei — os shaders USAM uniform mat4 ProjMatrix

Olha o shader 1:

```glsl
uniform mat4 ProjMatrix;
uniform mat4 ViewMatrix;
uniform mat4 ObjMatrix;
...
gl_Position = ProjMatrix * ViewPos;
```

É uniform de verdade! Deveria funcionar. Então o problema é outro: glUniformMatrix4fv não está sendo executado corretamente durante o replay

## Sessão 2026-10-02 — Resumo do dia

### Conquistado
- Captura de draws (M1-M5) funcionando
- Batch replay rodando sem travar
- Shadow FBO com geometria escrita (M5)
- Descoberta: shaders do GTA SA usam `uniform mat4 ProjMatrix / ViewMatrix / ObjMatrix`
- Descoberta: 105 programas têm slots, mas só alguns fazem os draws 3D (71, 89, 102, 200, ...)
- Programa 200 tem 0 uniforms → é efeito, não cena
- Filtro `ProgramIsScene3D` = tem slot loc=0 E loc=1

### Onde paramos
- M10 revelou que `glGetUniformfv(prog, loc=0, rb)` retorna `[0,0,0,0]`
- Significa: `glUniformMatrix4fv_Cap` NÃO está escrevendo no shader

### Próximo passo (M11)
Testar 3 hipóteses:
1. `p_UseProgram(d.program)` ativou o programa correto?
   - Ler `glGetIntegerv(GL_CURRENT_PROGRAM)` e comparar com `d.program`
2. O location que salvamos bate com o location real do driver?
   - Chamar `glGetUniformLocation(prog, "ProjMatrix")` e comparar com `g_slots[j].location`
3. O trampoline `glUniformMatrix4fv_Cap` funciona?
   - Se 1 e 2 OK mas readback = 0, usar `p_UniformMatrix4fv` em vez do hook

### Arquivos que precisam atualizar
- `mobile_render.cpp` — versão M11 (com diagnóstico)
- `documentacao.md` — adicionar esta seção

### Descobertas do disassembly do ZyZGfx64
- `HookOf_ShUniformMatrix4fv` (0x826e8): salva matrizes em struct por programa
- `HookOf_ShDrawElements` (0x82d60): empacota draws numa fila com snapshot de estado
- `shadows::Install` compila 5 shaders e cria 2 FBOs de depth (16-bit)
- Não há hook de UBO — GTA SA 2.00 não usa uniform blocks

### Comandos úteis pra próxima sessão
```bash
# Ver o log
grep -n "M8\|M9\|M10\|M11" /sdcard/Download/zyzshadows.log | head -30

# Ver se o jogo rodou
grep -n "Hook\]" /sdcard/Download/zyzshadows.log | head -15


## 💭 Pra amanhã

**Primeira coisa:** salva a documentação atualizada antes de mexer em código.

**Segunda:** me manda:
1. O `mobile_render.cpp` atual (M10)
2. O `documentacao.md` atualizado
3. Onde você parou: "rodamos M10, readback retornou zeros, próximo é M11"

Aí eu continuo direto de onde paramos.

**Bom descanso!** Você mereceu depois dessa maratona. 🚀


```markdown
## Sessão 2026-10-03 (manhã) — Diagnóstico do contexto GL

### M11 — 3 hipóteses testadas

**Resultado do teste M11:**
```

[M11-A] tentou=89 | current=-1 | match=0    ← glUseProgram não ativa
[M11-B] REAL: Proj=0 View=0 Obj=0           ← locations do driver = todas 0
[M11-C] readback = [0,0,0,0,...]            ← matriz não chega

```

### Descobertas críticas

1. **`glGetUniformLocation(prog, "ProjMatrix")` retorna 0** mesmo quando
   nosso mapa salvou o location correto (0). Isso significa que o driver
   está retornando 0 (talvez "not found") pra todos os uniforms.

2. **`glGetIntegerv(GL_CURRENT_PROGRAM)` retorna -1** depois de chamar
   `glUseProgram(89)`. O programa não está sendo ativado.

3. **`p_UseProgram` aponta pro libGLESv2 correto** (0xE806F234),
   o trampolim `glUseProgram_Cap` aponta pro nosso mod (0x87F4C258).
   Ambos deveriam funcionar, mas nenhum ativa o programa.

### Hipótese principal

**Contexto GL mudou entre captura e replay.**

Entre a Fase 1 (RenderEverythingBarRoads original) e a Fase 2 (nosso
replay), o jogo pode ter:
- Trocado o contexto EGL
- Feito flush/swap
- Destruído o contexto GL temporariamente

Como o `glDrawElements` ainda funciona (o shadow map tem geometria), o
contexto atual é válido — mas os **programs do jogo não existem nele**.
Por isso `glIsProgram(89)` provavelmente retorna `GL_FALSE`.

### Solução em investigação (M13)

Testar com `glIsProgram(program)` e `glGetError()`. Se `isProgram=0`,
o contexto mudou, e precisamos fazer o replay **dentro** da função
`RenderEverythingBarRoads` do jogo (mesmo contexto), não depois.

### Estruturas importantes de state

| Endereço (M12) | Valor |
|---|---|
| `p_UseProgram` | 0xE806F234 (libGLESv2 real) |
| `glUseProgram_Cap` (trampolim) | 0x87F4C258 (mod) |
| `p_UniformMatrix4fv` | 0xE806F220 (libGLESv2 real) |

### Programas do jogo descobertos (libGTASA 2.00)

| Programa | Draws/frame | Tem Proj/View? | Função |
|---|---|---|---|
| 1 | 1 | Sim | Shader principal |
| 4 | 4 | Sim | Variação |
| 7, 9, 11, 14, 16, 18, 21, 23, 25, 27... | poucos | Sim | Variações |
| 71, 89, 102 | ~80 cada | Sim | **Programas de cena 3D** |
| 200 | ~200 | **Não** | Efeitos/post-process |

**Programa 200 é dominante (~78% dos draws) mas é efeito.** Precisa ser
filtrado. `ProgramIsScene3D` = tem loc=0 E loc=1.

### Onde paramos

Testar M13 pra confirmar se o contexto mudou. Se sim, a solução é
**mudar o local do replay** (dentro do RenderEverything, entre draws),
em vez de depois.



📝 Atualização do documentacao.md

Adiciona essa seção enorme no final:

```markdown
================================================================================
## DESCOBERTA REVOLUCIONÁRIA — 2026-10-03 (manhã)
================================================================================

### O GTA SA Android NÃO usa GLES diretamente

Descoberta após analisar os símbolos exportados pelo `libGTASA.so`:

O jogo tem uma **camada de abstração de render própria** chamada **RQ**
(Render Queue) + **ES2Shader**. Ele **quase nunca chama funções GLES
diretamente**. Em vez disso, emite comandos pra uma fila interna, que
depois é processada pelo backend (GLES2 neste caso).

### Evidências

Símbolos exportados pelo `libGTASA.so`:

**Sistema RQ (Render Queue):**
- `RQCreateShader`
- `RQ_Command_rqDrawNonIndexed`     — comando de draw
- `RQ_Command_rqDraw` (implícito)
- `RQ_Command_rqSelectShader`       — ativa shader
- `RQ_Command_rqSetVertexDescription` — define attribs
- `RQ_Command_rqVertexBufferCreate` — cria VBO
- `RQ_Command_rqIndexBufferCreate`
- `RQ_Command_rqTextureMip`
- `RQ_Command_rqTargetClear`
- `RQ_Command_rqEnableBlend`
- `RQ_Command_rqEnableDepthRead`
- `RQ_Command_rqTargetScissor`
- `RQ_Command_rqCopy`
- `RQ_Command_rqReadPixels`
- `RQ_Command_rqShutdown`
- `RQ_Command_rqDeleteShader`
- `RQ_Command_rqVertexStateApply`
- `RQ_Command_rqVertexStateDelete`
- `RQ_Command_rqIndexBufferDelete`
- `RQ_Command_rqSelectTexture`
- `RQ_Command_rqSetBones`
- `RenderQueue::Reset` / `RenderQueue::Kill`
- `RQ_CheckThread`

**Backend de shader (ES2Shader):**
- `ES2Shader::Build(const char*, const char*)`   — compila
- `ES2Shader::Select`                             — ativa (equivalente a glUseProgram)
- `ES2Shader::SetActive`                          — ativa com estado
- `ES2Shader::SetMatrixConstant(RQShaderMatrixConstantID, const float*)`
- `ES2Shader::SetVectorConstant(RQShaderVectorConstantID, const float*, int)`
- `ES2Shader::SetColorAttribute(const float*)`
- `ES2Shader::SetBonesConstant(int, const float*)`
- `ES2Shader::CheckCompile`
- `ES2Shader::InitializeAfterCompile`
- `ES2Shader::activeShader`   ← VARIÁVEL GLOBAL (offset 0x6b8be4)
- `ES2Shader::aBindings`      ← offset 0x6b8bb8

**Outros:**
- `RQVertexBuffer`, `RQIndexBuffer`, `RQTexture`, `RQRenderTarget`
- `RQVertexState` — estado de vértices
- `RQShader::BuildSource`
- `RQMatrix::Identity`        ← offset 0x67a3d8
- `ProcessShaderCache`
- `emu_ShaderListGetList`
- `emu_IsAltDrawing`
- `emu_CustomShaderDelete`
- `InternalRegisterShader`

### Por que TODAS as nossas tentativas falharam

| Sintoma | Explicação |
|---|---|
| `glGetUniformLocation(prog, "ProjMatrix")` retorna 0 | O jogo **nunca chama essa função** — usa `ES2Shader::SetMatrixConstant` |
| `glIsProgram(102)` retorna 0 | O ID 102 **não é ID de programa GL** — é ID interno do RQ |
| `glUseProgram(102)` retorna OK mas nada ativa | O jogo **nunca chama glUseProgram(102)** — usa `ES2Shader::Select` |
| `glUniformMatrix4fv` no replay não faz nada | O jogo **nunca chama isso** — usa `ES2Shader::SetMatrixConstant` |
| `GL_CURRENT_PROGRAM` = -1 | O `activeShader` do jogo é **desconectado** do estado GL real até o RQ processar a fila |
| `glDrawElements` do jogo é RQ, não GL | O jogo emite `RQ_Command_rqDraw` na fila, e o RQ depois chama `glDrawElements` de verdade |

### Como o ZyZGfx64 realmente funciona

O mod **NÃO hooka GLES diretamente**. Ele hooka:

1. **`FrMobileRender`** (CPostEffects::MobileRender) — hook principal do frame
2. **Funções RQ** (Render Queue) do jogo:
   - `ES2Shader::Select` — intercepta ativação de shader
   - `ES2Shader::SetMatrixConstant` — intercepta envio de matrizes
   - Comandos RQ de draw
3. **`rq::`** — o mod cria sua própria versão do event bus (não é o do jogo, é paralelo)

Os hooks `HookOf_Sh*` que a gente dissecou (ShDrawElements, ShUseProgram, ShUniformMatrix4fv)
**NÃO são hooks de GLES** — são hooks de **shader/RQ**:
- `Sh` = **Shader**, não Draw
- O que ele intercepta é a API do `ES2Shader` / `RQ`

### Nova arquitetura proposta

**Em vez de hookar GLES (fadado a falhar), hookar a API RQ do jogo:**

```cpp
// Hook em ES2Shader::Select  (0x1cd369, 1216 bytes)
DECL_HOOKv(ES2Shader_Select) {
    // Se estamos no shadow pass, substitui o shader ativo
    // Senão, deixa o jogo fazer o que quiser
    ES2Shader_Select();
}

// Hook em ES2Shader::SetMatrixConstant  (0x1cd1c1, 98 bytes)
DECL_HOOKv(ES2Shader_SetMatrixConstant, int id, const float* mat) {
    // Durante shadow pass, substitui a matriz pela da luz
    // (dependendo do "id": ProjMatrix / ViewMatrix / ObjMatrix)
    ES2Shader_SetMatrixConstant(id, mat);
}

// Hook em RQ_Command_rqDrawNonIndexed  (0x1cc0e9, 110 bytes)
DECL_HOOKv(RQ_Command_rqDrawNonIndexed, char** cmd) {
    // Durante shadow pass, executa o draw no FBO do shadow com a luz
    // Fora do shadow, deixa passar
    RQ_Command_rqDrawNonIndexed(cmd);
}
```

Sem bind/unbind de FBO, sem capture de VBO. O jogo já faz isso — a gente só usa a API dele.

Offsets descobertos (libGTASA.so 2.00 ARM32)

Símbolo Offset
ES2Shader::Build 0x1ccc05
ES2Shader::Select 0x1cd369
ES2Shader::SetActive 0x1ccb01
ES2Shader::SetMatrixConstant 0x1cd1c1
ES2Shader::SetVectorConstant 0x1cd05d
ES2Shader::SetColorAttribute 0x1cd1a5
ES2Shader::SetBonesConstant 0x1cd225
ES2Shader::activeShader (global) 0x006b8be4
ES2Shader::aBindings (global) 0x006b8bb8
RQCreateShader 0x1cd829
RQ_Command_rqDrawNonIndexed 0x1cc0e9
RQ_Command_rqSelectShader 0x1cdb19
RQ_Command_rqSetVertexDescription 0x1cbda5
RQ_Command_rqVertexBufferCreate 0x1cb8c1
RQ_Command_rqTargetClear 0x1d10c5
RQ_Command_rqEnableBlend 0x1cfadf
RQ_Command_rqEnableDepthRead 0x1cfaf7
RQ_Command_rqDeleteShader 0x1cdced
RQ_Command_rqTextureMip 0x1d05ad
RQ_Command_rqTargetScissor 0x1d104d
RQ_Command_rqReadPixels 0x1cc599
RQ_Command_rqShutdown 0x1cc551
RQ_Command_rqCopy 0x1d1fbf
RenderQueue::Reset 0x1d2019
RenderQueue::Kill 0x1d2561
RQVertexState::Apply 0x1d27f5
RQVertexBuffer::Set 0x1d28e5
RQRenderTarget::Select 0x1d09d9
RQRenderTarget::Create 0x1d08c1
RQRenderTarget::Viewport 0x1d3bb9
RQMatrix::Identity 0x0067a3d8
ProcessShaderCache 0x2a91b1

Próximo passo (M14)

Dissecar 3 funções RQ pra entender:

1. ES2Shader::SetMatrixConstant — descobrir o enum RQShaderMatrixConstantID
   (ProjMatrix = ?, ViewMatrix = ?, ObjMatrix = ?)
2. RQ_Command_rqDrawNonIndexed — como o comando é executado
3. ES2Shader::Select — o que faz exatamente

Com isso, a gente troca a abordagem GLES pela abordagem RQ — muito mais
simples e é o que o ZyZGfx64 realmente faz.


🎯 DESCOBERTA CHAVE — Como as matrizes realmente funcionam

Traduzindo o ES2Shader::SetMatrixConstant:

```asm
mov r5, r2            ; r5 = ponteiro pra matriz recebida
movs r2, #0x4c        ; 0x4c = 76
mla r6, r1, r2, r0    ; r6 = this + id * 0x4c
add.w r4, r6, #0x2ac  ; r4 = endereço da matriz no slot
; Copia 64 bytes (4x4 matrix) pra [this + id*0x4c + 0x2ac]
strb r0, [r6, #0x2a8] ; seta flag "dirty" em [this + id*0x4c + 0x2a8]
strb r0, [r6, #0x2ec] ; seta flag em [this + id*0x4c + 0x2ec]
```

🔥 Traduzindo

Cada shader tem um array interno de 4 matrizes (ProjMatrix, ViewMatrix, ObjMatrix, + 1). Cada uma ocupa 76 bytes (0x4c):

```
ES2Shader {
    ...
    +0x2a8: u8  dirty_flag[4]       // array de 4 flags
    +0x2ac: float matrix[4][16]     // array de 4 matrizes 4x4
    +0x2ec: u8  uploaded_flag[4]    // array de 4 flags "já enviado"
}
```

SetMatrixConstant(id, mat) faz:

1. Copia os 64 bytes pra this + 0x2ac + id*0x4c
2. Seta flag "dirty" em this + 0x2a8 + id*0x4c

🔥 E o ES2Shader::Select

```asm
; Percorre as 4 matrizes
0x1cd4b4: ldrb r0, [r4, #0x2a8]   ; checa dirty flag 0
0x1cd4b8: cmp r0, #0
0x1cd4ba: beq skip0                ; se não dirty, pula
0x1cd4c6: movs r3, #5              ; opcode 5 = "set matrix"
str r3, [r2]                       ; escreve opcode no command buffer
movs r3, #0
str r3, [r2]                       ; escreve id=0
; Copia 64 bytes da matriz pro command buffer
vld1.8 ... / vst1.8 ...
```

Select() empacota cada matriz num command buffer com opcode 5, id, e 64 bytes. O command buffer depois é processado (batch).

🎯 Como o jogo REALMENTE aplica as matrizes

```
SetMatrixConstant(id, mat)  → armazena em ES2Shader (não envia GL ainda)
Select()                    → empacota num command buffer
ProcessRenderQueue          → executa comandos → envia pra GL
```

Por isso glUniformMatrix4fv direto não funcionava: o jogo não usa essa função. Ele usa SetMatrixConstant que é uma função wrapper, e depois Select que empacota, e depois o RQ processa tudo em batch.

🎯 Nova estratégia

Hookar ES2Shader::SetMatrixConstant e substituir a matriz pela da luz quando em shadow pass:

```cpp
DECL_HOOKv(ES2Shader_SetMatrixConstant, void* this, int id, const float* mat) {
    if (g_inShadowPass) {
        // id=0 é ProjMatrix, id=1 é ViewMatrix (ou algo assim)
        // Substitui por lightProj/lightView
        if (id == 0) mat = g_lightProj.m;
        else if (id == 1) mat = g_lightView.m;
    }
    ES2Shader_SetMatrixConstant(this, id, mat);
}
```

Isso é 100x mais simples que hookar GLES. E funciona porque usa o pipeline correto do jogo.

📋 3 coisas pra fazer

1. Descobrir qual id é qual matriz. Provavelmente:

· id=0 = ProjMatrix
· id=1 = ViewMatrix
· id=2 = ObjMatrix
· id=3 = outro

Como descobrir: hook SetMatrixConstant, logar id e os primeiros bytes da matriz. Se id=0 tiver a projeção (formato perspectiva: [2.4, 0, 0, 0]...), é ProjMatrix.

2. Hookar SetMatrixConstant e substituir durante shadow pass.

3. Não precisa mais de capture de VBO, attrib, glDrawElements! O jogo faz isso. A gente só modifica as matrizes que vão pro shader, e o jogo cuida do resto.

❓ Próximo passo

Roda:

```bash
cd "/storage/emulated/0/PROJECT AML"

# Confirma os 2 offsets globais
readelf --dyn-syms libGTASA.so | grep -iE 'ES2Shader.*activeShader|RQShader.*const|MatrixConstantID'

# Confirma que os 4 IDs existem
readelf --dyn-syms libGTASA.so | grep -iE 'RQShaderMatrix|RQShaderVector|RQShaderColor|RQShaderBones'
```

E depois me manda o mobile_render.cpp que você tem (M13). Vou reescrever ele inteiro com a nova abordagem:

· Mantém o hook de RenderEverythingBarRoads pra abrir/fechar o shadow pass
· Hooka ES2Shader::SetMatrixConstant pra trocar matrizes
· Remove tudo de VBO/attrib/draw — o jogo já faz
· Fica em ~200 linhas em vez de 700

Isso é o caminho correto. 🚀

🎯 Estrutura do ES2Shader decifrada

Traduzindo o que o SetMatrixConstant faz:

```asm
mov r5, r2              ; r5 = matriz recebida
movs r2, #0x4c          ; 0x4c = 76 (tamanho de cada slot)
mla r6, r1, r2, r0      ; r6 = this + id * 76
add.w r4, r6, #0x2ac    ; r4 = slot + 0x2ac (onde a matriz vai)
blx memcpy              ; copia 64 bytes
strb r0, [r6, #0x2a8]   ; seta flag "dirty" do slot
strb r0, [r6, #0x2ec]   ; seta flag "uploaded" do slot
```

📐 Estrutura interna do ES2Shader

```
ES2Shader {
    +0x3E8: GLuint  gl_program_id   ← ID OpenGL real!
    
    // Array de 4 slots de matriz (cada um 0x4c = 76 bytes)
    +0x2A8: u8      dirty[0]         ← flag "precisa re-enviar"
    +0x2AC: float   matrix[0][16]    ← 4x4 matrix (64 bytes)
    +0x2EC: u8      uploaded[0]
    
    +0x2F4: u8      dirty[1]         ← slot 1 (+0x4c)
    +0x2F8: float   matrix[1][16]
    +0x338: u8      uploaded[1]
    
    +0x340: u8      dirty[2]         ← slot 2 (+0x98)
    +0x344: float   matrix[2][16]
    
    +0x38C: u8      dirty[3]         ← slot 3 (+0xe4)
    +0x390: float   matrix[3][16]
}
```

🎯 Como o jogo aplica matrizes (fluxo real)

```
1. Jogo chama ES2Shader::SetMatrixConstant(shader, id, mat)
   → armazena em shader.matrix[id], marca dirty[id] = 1

2. Jogo chama ES2Shader::Select(shader)
   → percorre dirty[0..3], pra cada um empacota num command buffer:
     [opcode=5, id, 64 bytes da matriz]
   → limpa dirty[id]

3. RQ (Render Queue) processa o command buffer
   → executa todos os comandos em batch
   → envia pra GL via glUniformMatrix4fv original
```

Por isso nossa abordagem GLES falhava: o jogo armazena a matriz no struct, empacota num buffer de comandos, e só muito depois chama glUniformMatrix4fv real. Nossa intercepção de GLES não conseguia nem ver nem modificar.

🎯 Hook estratégico

Hook em ES2Shader::SetMatrixConstant — intercepta a matriz na origem:

```cpp
DECL_HOOKv(ES2Shader_SetMatrixConstant, void* this_, int id, const float* mat) {
    if (g_inShadowPass) {
        // Substitui Proj/View pelas matrizes da luz
        if (id == 0) mat = g_lightProj.m;
        else if (id == 1) mat = g_lightView.m;
        // id 2, 3 = deixa passar (ObjMatrix, etc)
    }
    ES2Shader_SetMatrixConstant(this_, id, mat);
}
```

📋 Antes: precisa descobrir qual id é qual

Roda esse hook de diagnóstico:

```cpp
// Adiciona no mobile_render.cpp (junto aos outros hooks)
static int g_totalMatrixLogs = 0;

DECL_HOOKv(ES2Shader_SetMatrixConstant, void* this_, int id, const float* mat) {
    if (g_totalMatrixLogs < 20 && mat) {
        g_totalMatrixLogs++;
        ZLOG("[ES2M] this=%p id=%d | [%.2f %.2f %.2f %.2f / %.2f %.2f %.2f %.2f / %.2f %.2f %.2f %.2f / %.2f %.2f %.2f %.2f]",
             this_, id,
             mat[0], mat[1], mat[2], mat[3],
             mat[4], mat[5], mat[6], mat[7],
             mat[8], mat[9], mat[10], mat[11],
             mat[12], mat[13], mat[14], mat[15]);
    }
    ES2Shader_SetMatrixConstant(this_, id, mat);
}
```

E no InstallMobileRenderHook:

```cpp
{
    uintptr_t addr = aml->GetSym(base, "_ZN9ES2Shader17SetMatrixConstantE24RQShaderMatrixConstantIDPKf");
    if (addr && HOOK(ES2Shader_SetMatrixConstant, addr))
        ZLOG("[Hook] ES2Shader::SetMatrixConstant OK @ 0x%08X", addr);
    else
        ZERR("[Hook] ES2Shader::SetMatrixConstant FALHOU");
}
```

🎯 O que esperar

```
[ES2M] this=0x... id=0 | [2.41 0.00 0.00 0.00 / 0.00 5.36 0.00 0.00 / 0.00 0.00 -1.00 -1.00 / 0.00 0.00 -1.80 0.00]
[ES2M] this=0x... id=1 | [-1.00 0.00 0.00 0.00 / 0.00 1.00 0.00 0.00 / 0.00 0.00 -1.00 0.00 / 0.00 0.00 0.00 1.00]
[ES2M] this=0x... id=2 | [0.66 -0.75 0.00 0.00 / 0.75 0.66 0.00 0.00 / 0.00 0.00 1.00 0.00 / 2239 -1468 22 1.00]
```

Interpretação:

· id=0 com [2.41 0 0...] = ProjMatrix (diagonal perspectiva)
· id=1 com [-1 0 0...] = ViewMatrix (ortonormal, sem translação grande)
· id=2 com translação grande = ObjMatrix

📝 Atualização do documentacao.md

```markdown
================================================================================
## ES2Shader — Estrutura interna (2026-10-03)
================================================================================

### Tradução do `SetMatrixConstant` (0x1cd1c1)

```asm
movs r2, #0x4c         ; tamanho de cada slot
mla r6, r1, r2, r0     ; r6 = this + id*0x4c
add.w r4, r6, #0x2ac   ; r4 = slot + 0x2ac (matriz)
; copia 64 bytes (vld1/vst1 NEON)
strb r0, [r6, #0x2a8]  ; dirty flag
strb r0, [r6, #0x2ec]  ; uploaded flag
```

Struct ES2Shader (parcial)

Offset Campo
+0x2A8 u8 dirty[0]
+0x2AC float matrix[0][16]
+0x2EC u8 uploaded[0]
+0x2F4 u8 dirty[1]
+0x2F8 float matrix[1][16]
+0x338 u8 uploaded[1]
+0x340 u8 dirty[2]
+0x344 float matrix[2][16]
+0x38C u8 dirty[3]
+0x390 float matrix[3][16]
+0x3E8 GLuint gl_program_id

Fluxo real de aplicação de matriz

```
1. SetMatrixConstant(shader, id, mat) → armazena em shader.matrix[id]
2. ES2Shader::Select(shader) → empacota em command buffer
3. RQ processa command buffer → chama glUniformMatrix4fv real
```

Motivo do nosso fracasso: tentamos interceptar a Fase 3 (GLES), mas o jogo
nunca chama glUniformMatrix4fv diretamente durante o RenderEverything.
Só chama via RQ, e muito depois (fora do escopo dos nossos hooks).

Nova estratégia

Hookar ES2Shader::SetMatrixConstant (Fase 1) — interceptar a matriz
na origem, antes dela virar comando RQ. Muito mais simples e confiável.

Offsets chave

Símbolo Offset ARM32
ES2Shader::SetMatrixConstant 0x001cd1c0 (Thumb)
ES2Shader::SetVectorConstant 0x001cd05c (Thumb)
ES2Shader::SetColorAttribute 0x001cd1a4 (Thumb)
ES2Shader::SetBonesConstant 0x001cd224 (Thumb)
ES2Shader::activeShader (global) 0x006b8be4
ES2Shader::aBindings (global) 0x006b8bb8
ES2Shader::Select 0x001cd368 (Thumb)
ES2Shader::SetActive 0x001ccb00 (Thumb)
ES2Shader::Build 0x001ccc04 (Thumb)

```
## M15 — Hooks ES2Shader (09:13)

### Resultado
- `ES2Shader::SetMatrixConstant` OK (id=0/1/2 sempre, matrizes 2D)
- `ES2Shader::Select` OK — mas só vê 2 shaders: `0xebb09c10` (glId=0,1) e `0xebb14410` (glId=0,4)
- `ES2Shader::SetActive` NÃO é chamado durante gameplay

### Conclusão
Os shaders 3D (71, 89, 102) NÃO usam ES2Shader. São ativados via
`glUseProgram` direto, provavelmente pelo RQ processing (fora do
RenderEverythingBarRoads).

### Próximo passo
Logar `glUseProgram` pra ver os IDs únicos e descobrir quando os shaders
3D são ativados.

## M15 — Hooks ES2Shader (09:13)

### Resultado
- `ES2Shader::SetMatrixConstant` OK, mas só vê 2 shaders com matrizes 2D (id=0/1/2 identidade)
- `ES2Shader::Select` OK, mas só vê 2 shaders: `0xebb09c10` (glId=0,1) e `0xebb14410` (glId=0,4)
- `ES2Shader::SetActive` NÃO é chamado durante gameplay

### Conclusão
Os shaders 3D (71, 89, 102) NÃO passam por `ES2Shader::Select`.
Provavelmente são ativados via `glUseProgram` direto — mas fora do
escopo dos nossos hooks (no RQ processing, depois de RenderEverything
retornar).

### Próximo passo (M16)
Logar TODOS os IDs únicos que `glUseProgram` recebe. Isso responde:
- Se 71/89/102 aparecem → usam GLES direto
- Se não aparecem → usam outro caminho (RwD3D9, RQ, etc)

## Análise do ES2Shader::SetMatrixConstant (09:07)

### Resultado
- Hook OK em 0x001cd1c0
- Só 2 shaders aparecem: `0xebb14410` e `0xebb14c10`
- Padrão por frame: id=2 (identidade), id=1 (identidade), id=0 (projeção 2D)
- Matrizes NÃO mudam entre frames → provavelmente UI/HUD

### Interpretação
`ES2Shader::SetMatrixConstant` é usado principalmente para UI/HUD, não para
cena 3D. Os shaders 3D devem usar outro caminho.

### Próxima investigação (M15)
1. Hook `ES2Shader::Select` — ver quais shaders são ativados
2. Hook `ES2Shader::SetActive` — idem
3. Ler `glId` (+0x3E8) pra ver o GL program ID real
4. Comparar com os IDs que `glUseProgram` vê

### Hipótese
O jogo emite comandos RQ durante o RenderEverything, e processa DEPOIS
(fora do escopo dos nossos hooks). Por isso `glUseProgram` retorna -1
quando tentamos ativar durante o RE — a fila ainda não foi processada.

## M16 — Log de IDs únicos (09:17)

### Resultado
O jogo ativa ~88 shaders em um único segundo (burst de streaming):
IDs 2,1,3,4,5,6,7,8,9,10 (setup inicial)
IDs 11,14,16,18,21,23,25,27,29,31,33,34,35,37,38,39,41,43,45,46,
    48,49,51,52,54,55,57,58,59,61,64,66,68,69,71,73,74,75,76,78,
    79,80,81,84,87,89,90,92,...

**IDs 71 e 89 confirmados como existentes e ativados via glUseProgram.**

### Conclusão
Os shaders 3D SÃO ativados via glUseProgram (não é ES2Shader). Isso
confirma que o jogo usa GLES direto pra cena.

### Hipótese atual
Os shaders são criados (streaming) quando o mapa carrega, e DESTRUÍDOS
depois de um tempo (cache de shader). Quando nosso replay roda (após
RenderEverything), alguns já foram deletados.

### Próximo passo (M17)
Logar glUseProgram DURANTE RenderEverything pra ver quais programas
estão realmente em uso no momento do render.

## M17 — Programas durante RenderEverything (09:22)

### Resultado
Confirmado: shaders 3D SÃO ativados via glUseProgram DURANTE o render.

Programas detectados no RE:
- 1, 4         → cena 3D principal
- 71, 89       → cena 3D (mais usados)
- 101, 102, 132 → variações
- 200, 229, 185 → efeitos/post (sem Proj/View)

### Conclusão FINAL
A captura está correta. O problema é o REPLAY em batch — roda depois
do RenderEverything retornar, e nesse ponto o contexto pode ter mudado.

### Solução definitiva (M18)
Replay INLINE no glDrawElements_Cap:
1. Chama original (jogo desenha na tela normal)
2. Imediatamente faz replay no shadow FBO (mesmo contexto)
3. Restaura estado

Performance ruim (bind/unbind por draw), mas é o único jeito que funciona.
Depois otimiza agrupando por programa.

## M18/M19 — Replay INLINE (09:26)

### Descoberta
`glDrawElements` INLINE (dentro do hook) FUNCIONA.
O batch replay (fora do RenderEverything) sempre falhou porque o contexto
muda / shaders são deletados.

### Progresso
- M18: replay inline sem matriz → Q1 vazio
- M19: + estados GL forçados → **Q1=[B8 6C B0 DD]** ← geometria!
- M20: + matriz da luz → esperado: geometria espalhada pelos 4 quadrantes

## M21 — Salva/restaura matrizes (09:40) ✅

### Glitch RESOLVIDO
Salvando as matrizes originais via `glGetUniformfv` antes de aplicar
a matriz da luz, e restaurando depois do draw — o glitch visual sumiu.

### Estado atual
- ✅ Shadow FBO com geometria (Q1/Q2/Q3 válidos)
- ✅ Matriz da luz aplicada corretamente
- ✅ Glitch zero na tela principal
- ❌ `capturados` cai pra 0 depois do primeiro frame

### Hipótese do `capturados=0`
O jogo usa `glDrawArrays` (não só `glDrawElements`) para parte da cena.
Adicionando hook em `glDrawArrays` para capturar.
## M23 — Shadow map FUNCIONANDO (09:49) ✅

### Resultado
M23] #60 | frameDraws=1296 frameProc=1295 reCalls=60 | progs=14
[M23/Replay] centro=[00 00 00 00] Q1=[32 CF 43 3F] Q2=[55 27 85 DD] Q3=[F4 26 85 DD]

```

- ~21 draws por chamada de RE (60 RE calls em 60 frames)
- Todos os draws processados com sucesso
- Q1 muda a cada frame → geometria ativa (carro, player)
- Q2/Q3 estáveis → chão plano
- Centro vazio → direção do sol não cobre esse ponto

### Arquitetura final do mod (até agora)
1. **Hook `CPostEffects::MobileRender`** — controle do frame
2. **Hook `CRenderer::RenderEverythingBarRoads`** — cena 3D
   - Limpa shadow FBO 1x no início
   - Captura draws (glDrawElements + glDrawArrays)
3. **Hook `glDrawElements_Cap`** e **`glDrawArrays_Cap`**:
   - Chama original (jogo desenha na tela)
   - Se em shadow pass: **replay inline** com:
     - Bind shadow FBO + viewport 1024x1024
     - ColorMask(0,0,0,0) + DepthMask(1) + DepthTest(1) + DepthFunc(LEQUAL)
     - Substitui ProjMatrix/ViewMatrix pelas da luz
     - Chama `glDrawElements` (mesmo VBO/IBO/attribs do jogo)
     - **Restaura** matrizes originais (evita glitch)
     - Restaura FBO/viewport/colormask/depthmask
4. **Hooks ES2Shader** (`SetMatrixConstant`, `Select`, `SetActive`) — apenas interceptação, sem uso ativo

### Próximo milestone (M24)
**Composite** — aplicar o shadow map na renderização final.

Precisa:
- Compilar shader próprio (quad fullscreen + amostragem do shadow map)
- Hook em ponto de post-process (`CPostEffects::MobileRender`?)
- Desenhar quad no FBO do jogo antes do output final

Desafio: compilar e linkar shader dentro do hook (usar `gl::Compile`/`gl::Link` do próprio jogo se possível).

## 🔥 DESCOBERTA — Threading model do GTA SA

### Problema
`RenderEverythingBarRoads` roda na **thread principal**, mas o contexto EGL só
está ativo na **thread de render** (RQ processor).

Provas:
- `glGetString(GL_VERSION)` retorna NULL em RenderEverythingBarRoads
- `glCreateShader(...)` retorna 0 sem erro
- Mas `glDrawElements` funciona — porque roda na thread correta

### Conclusão
Qualquer operação GL "de setup" (criar shader, criar textura, etc) DEVE ser
feita dentro de hooks que rodam na thread de render:
- `glDrawElements`
- `glDrawArrays`
- `glBindFramebuffer` (provavelmente)

### Impacto
Isso explica por que o ZyZGfx64 usa o `rq::` event bus — ele enfileira comandos
pra rodar na thread correta.

Nossa solução: usar "pending flags" (como `g_shaderInitPending`) que a thread
principal seta, e a thread de render processa na primeira oportunidade.
# 🔥 Threading model CONFIRMADO (10:33)

### Prova
```

[M24-INIT] GL_VERSION='OpenGL ES 3.2 V@0615.91 (Qualcomm)'
[M24-CS] glCreateShader -> 268, compile status = 1
[M24-INIT] link status=1

```

- `RenderEverythingBarRoads` → thread principal (SEM contexto GL)
- `glDrawElements` → thread de render (COM contexto GL 3.2 Qualcomm)

### Regra
**Toda operação GL deve rodar na thread de render** (dentro dos hooks
`glDrawElements`/`glDrawArrays`, ou em algum hook que rode lá).

O padrão correto é:
1. Thread principal marca flags (`g_shaderInitPending`, `g_debugDrawPending`)
2. Thread de render checa as flags e executa na primeira oportunidade

Isso é o mesmo modelo do ZyZGfx64 (rq:: event bus).

### GPU
Qualcomm, OpenGL ES 3.2 (drivers v0615.91)
```
Boa ideia! Documenta enquanto tá fresco. Aqui vai o texto pronto pra colar no final do documente.md:

---

```markdown
## M28 — Clear na thread correta (10:xx) ⚠️ PARCIAL

### Descoberta
O `glClear` chamado dentro de `RenderEverythingBarRoads` (main thread) 
não funciona — a main thread não tem contexto GL ativo.

### Mudança
- Adicionada flag `g_needClearShadowFbo` setada na main thread
- Clear executado dentro do `InlineReplay*` (render thread)

### Problema
Log mostrou `status=0x8CD6/0x8CD7` no `glCheckFramebufferStatus` — 
FBO com anexo inválido ou sem anexo.

---

## M29 — Dump como FLOAT ❌ ERRO MEU

### Hipótese
`GL_DEPTH_COMPONENT` + `GL_UNSIGNED_BYTE` (M28) era inválido em GLES 3.0.

### Mudança
Trocado para `GL_DEPTH_COMPONENT` + `GL_FLOAT` (0x1406).

### Resultado
- `-1.0` retornado em todos os pontos
- Erro meu: `FLOAT` também não é válido em GLES 3.0

### Conclusão
Pares válidos pra ler depth são apenas:
- `GL_DEPTH_COMPONENT` + `GL_UNSIGNED_SHORT` (0x1403)
- `GL_DEPTH_COMPONENT` + `GL_UNSIGNED_INT` (0x1405)

---

## M30 — Dump UNSIGNED_INT + sentinel

### Mudança
- `GL_DEPTH_COMPONENT` + `GL_UNSIGNED_INT` (0x1405)
- Sentinel `0xDEADBEEF` pra detectar se leitura escreveu algo
- `glGetError` após cada `glReadPixels`

### Resultado
```

(0,0) = 0xDEADBEEF (0.86984) err=0x506 READ_FAIL
fails=1024/1024

```

**`0x506` = `GL_INVALID_FRAMEBUFFER_OPERATION`** — FBO incompleto.

---

## M31 — Diagnóstico FBO + proteção delete

### Mudança
- Hook `glDeleteTextures` / `glDeleteFramebuffers` (proteção)
- `glCheckFramebufferStatus` antes de cada dump

### Resultado
```

boundFbo=2 g_shadowFboId=2 texId=3 status=0x8CD7 (complete=0x8CD5)

```

**`0x8CD7` = `INCOMPLETE_MISSING_ATTACHMENT`** — sem nenhum anexo!

### Timeline reveladora
```

[11:23:59] OK FBO 2 criado (tex=3)
↓ 8 segundos
[11:24:07] COLISAO! Jogo pegou FBO 2 (nosso). Substituto: 3

```

**Conclusão:** o driver Qualcomm **recicla IDs** quando acha que foram 
liberados (ex.: transição menu → gameplay).

---

## M32 — Reattach do attachment

### Mudança
A cada início de frame, checa `glCheckFramebufferStatus`. Se ≠ 0x8CD5, 
faz `glFramebufferTexture2D` de novo.

### Resultado
```

reattach no inicio do frame (st=0x8CD7)
apos reattach: 0x8CD7    ← reattach REJEITADO

```

Reattach não resolve — o driver não aceita mais o ID 3 como depth.

---

## M33 — Reserva de IDs em massa ❌ NÃO FUNCIONOU

### Hipótese
Reservar 512 FBOs e 512 texturas antes de criar nosso.

### Mudança
- `ReserveHandlesOnce()` — aloca 512+512 IDs dummy
- Hook `glGenTextures` (trocava nosso ID por substituto)

### Resultado
```

[M33] Reservados: FBOs 2..513 | Texs 3..514
[Shadow] FBO id=514 obtido (tex=516)
↓ 9 segundos
[M33] COLISAO TEX! Jogo pegou 516 (nossa). Trocando... (substituto 517)

```

O jogo/driver **continua reciclando** mesmo com IDs altos.

### Aprendizado
Trocar o ID no buffer do caller **não muda nada no driver** — o driver 
já registrou o ID original como alocado. Hook inútil.

---

## M34 — `glIsTexture` + `glIsFramebuffer` ⚠️ THREAD ERRADA

### Mudança
- `EnsureShadowValid()` usando `glIsTexture`/`glIsFramebuffer`
- Chamado em `RenderEverythingBarRoads` (main thread)

### Resultado
```

RECURSOS MORTOS! tex 3 existe=0 | fbo 2 existe=0 -> RECRIANDO
Criando FBO (tentativa #4)...
D24/UI: glGenTextures = 0    ← todas falharam

```

**Bug:** `glGenTextures` retornando 0 = chamada GL **na thread errada**.

### Aprendizado
Já sabíamos disso pelo documento:
> "Toda operação GL deve rodar na thread de render"

Mas esquecemos de aplicar ao `EnsureShadowValid`.

---

## M35 — Recriação na thread correta ✅ GRANDE AVANÇO

### Arquitetura nova
- **Main thread** (`RenderEverythingBarRoads`): só seta flag `g_recreatePending`
- **Render thread** (`InlineReplay*`): chama `TryProcessRecreate()`, 
  valida de verdade com `glIsTexture`/`glIsFramebuffer`, recria se preciso

### Resultado
```

[M35] RECURSOS MORTOS (render thread)! tex=3/1 fbo=2/0 -> RECRIANDO
[Shadow] OK formato D24/UI tex=3053 1024x1024
[Shadow] === OK! FBO=51 Tex=3053 (recriacao #4) ===
[M35-DIAG] boundFbo=51 g_shadowFboId=51 texId=3053 status=0x8CD5 (complete=0x8CD5)

```

### 🎉 Conquistas
- ✅ Detecção de reciclagem **na thread certa**
- ✅ Recriação funcionou (novos IDs: 51, 3053)
- ✅ **`status=0x8CD5` — FBO COMPLETO pela primeira vez**
- ✅ Bug de `glGenTextures = 0` sumiu

### ❌ Problema restante
```

[M35-DUMP] err=0x502 READ_FAIL  ← agora 502, não 506

```

**`0x502` = `GL_INVALID_OPERATION`** — FBO tá completo mas leitura 
ainda rejeitada.

### Hipótese
FBO é depth-only. `READ_BUFFER` default = `GL_COLOR_ATTACHMENT0` 
(não existe). Precisa setar `glReadBuffer(GL_NONE)`.

---

## M36 — Read buffer + combos (EM TESTE)

### Mudanças
- `glReadBuffer(GL_NONE)` antes do dump (se função disponível)
- Testa 4 combos de format/type em (512,512):
  - `DEPTH + UINT`
  - `DEPTH + USHORT`
  - `DEPTH + FLOAT`
  - `DEPTH_STENCIL + UINT_24_8`

### Estado atual
⏳ Aguardando resultado do log M36

### Se falhar ainda
Plano B: adicionar **color attachment dummy** ao FBO do shadow map 
(porque o driver Qualcomm pode exigir color buffer pra aceitar 
read operations).

---

## 🧠 Lições aprendidas até agora

| Lição | Onde foi aprendida |
|---|---|
| FBO ID é reciclado pelo driver Qualcomm | M32/M33 |
| Trocar ID no buffer do caller não engana o driver | M33 |
| `glIsTexture`/`glIsFramebuffer` só funcionam na thread GL | M34 |
| `glGenTextures` na thread errada retorna 0 silenciosamente | M34 |
| FBO depth-only precisa de `glReadBuffer(GL_NONE)` | M36 (hipótese) |
| `glReadPixels` de depth só aceita `USHORT` ou `UINT` (não `BYTE`/`FLOAT`) | M29/M30 |
| Status FBO: 0x8CD5=OK, 0x8CD6=attachment inválido, 0x8CD7=sem anexo | M31 |

## 🔧 Arquitetura atual (M36)

1. **`hooks.cpp`** — hooks GLES de baixo nível
   - `glBindFramebuffer` → tracking + lazy create do shadow FBO
   - `glGenFramebuffers` → proteção contra colisão do nosso FBO
   - `glDrawElements`, `glViewport`, `glFramebufferTexture2D` → tracking

2. **`shadow_pass.cpp`** — gerencia FBO/texture do shadow map
   - `TryCreateOnce()` — criação lazy
   - `EnsureShadowValid()` — main thread, só seta flag
   - `TryProcessRecreate()` — render thread, valida e recria de verdade

3. **`mobile_render.cpp`** — replay inline do shadow pass
   - Hook `RenderEverythingBarRoads` (main): seta flags
   - Hook `glDrawElements`/`glDrawArrays` (render): replay inline
   - `DumpShadowMapToFileNoBind()` — debug de leitura do shadow map

## 🎯 Próximo milestone (M37 se M36 falhar)

Se M36 mostrar `err=0x502` em todos os combos:
- Adicionar `GL_COLOR_ATTACHMENT0` com uma textura RGBA dummy 
  (só pra o driver aceitar o FBO como "readable")
- Isso é workaround conhecido do driver Qualcomm
```

---

Se quiser, posso fazer uma versão mais curta (só os títulos e resultados, sem detalhes), ou mais detalhada (com os códigos). Esse formato tá no meio do caminho — bate com o estilo do seu doc original.

Depois de colar, compila o M36 e manda o log! 🚀

```markdown
## M38.1 — Fix do falso positivo de colisão ✅ RESOLVIDO

### Problema
Em OpenGL, IDs de FBO e Textura são namespaces **separados**. O FBO 3 
e a textura 3 podem coexistir. Mas no M38 `IsOurFbo` checava o ID da 
colorTex também:

```cpp
bool IsOurFbo(unsigned id) { return id != 0 && (id == g_shadowFBO || id == g_shadowColorTex); }
//                                                 ^^^^^^^^^^^^^^^^^^^^^^^^^^^^ ERRADO
```

Quando o driver devolvia "FBO 3" pro jogo (coincidindo com o ID da nossa 
textura 3), o hook tratava como colisão, substituía por 4, e bagunçava o 
state do jogo → crash.

Fix

```cpp
bool IsOurFbo(unsigned id) { return id != 0 && id == g_shadowFBO; }
```

Resultado após fix

```
RECURSOS MORTOS! tex=1 fbo=0 color=1 -> RECRIANDO
recriacao OK: fbo 2->50 | tex 4->1878 | color 3->1877
[M38.1-DIAG] status=0x8CD5 (complete=0x8CD5)
[M38.1-DUMP] err=0x0
```

· ✅ Sem crash
· ✅ FBO completo
· ✅ Recriação funcionando
· ✅ Draws capturados sem problema

---

🧠 Descobertas importantes (consolidado)

Adreno não permite glReadPixels de depth em FBO

Tentamos 6 variações (M28-M38):

· GL_DEPTH_COMPONENT + GL_UNSIGNED_BYTE → INVALID_OPERATION
· GL_DEPTH_COMPONENT + GL_FLOAT → INVALID_OPERATION
· GL_DEPTH_COMPONENT + GL_UNSIGNED_INT → INVALID_OPERATION
· GL_DEPTH_COMPONENT + GL_UNSIGNED_SHORT → INVALID_OPERATION
· GL_DEPTH_STENCIL + GL_UNSIGNED_INT_24_8 → INVALID_OPERATION
· glReadBuffer(GL_NONE) → INVALID_ENUM

Conclusão: o driver Qualcomm Adreno simplesmente não permite ler 
depth de FBO via glReadPixels. Só funciona ler cor (RGBA + UNSIGNED_BYTE 
retornou err=0x0).

Leitura de cor funciona

· glReadBuffer(GL_COLOR_ATTACHMENT0) → OK
· glReadPixels(..., GL_RGBA, GL_UNSIGNED_BYTE, ...) → OK

FBO depth-only sozinho não aceita reads

Precisamos de um color attachment dummy mesmo que não use, pro driver 
ficar satisfeito.

---

M24.1 — Composite FBO (teste de cor) ⏳ EM TESTE

Objetivo

Criar um FBO de composite separado (RGBA8, 512x512), limpar de vermelho, 
ler com glReadPixels e confirmar que a leitura de cor funciona.

Lógica

Se conseguirmos ler o composite FBO (que é RGBA puro), conseguimos construir 
o M24 real: compilar shader próprio, desenhar quad fullscreen, aplicar sombra, 
e ler o resultado.

Estado atual

⏳ Aguardando log

Se funcionar → próximo é M24.2

Compilar shader (vertex + fragment) na thread de render, desenhar quad 
fullscreen no composite FBO.

```

---

## 📋 Checklist

| Arquivo | Versão |
|---|---|
| `shadow_pass.h` | M35 (sem mudança) |
| `shadow_pass.cpp` | M38.1 (sem mudança) |
| `mobile_render.cpp` | **M24.1** ← atualizado |
| `hooks.cpp` | M34 (sem mudança) |

---
# M24.2.1 — VAO dedicado + restore ✅ NÃO TRAVOU

### Mudanças
1. VAO dedicado pro quad (`g_quadVao`) — isolado do VAO do jogo
2. Configura attribs **dentro desse VAO** (não toca no do jogo)
3. Salva/restaura: FBO, Viewport, Program, ARRAY_BUFFER, ReadBuffer, ClearColor
4. Removido `glFinish` no meio do frame

### Resultado
```

[M24.2.1] quad VBO=513 VAO=1 prog=274 locPos=0
[M24.2.1-TEST] drawErr=0x0 readErr=0x0 | pixel = R255 G255 B0 A255
[M24.2.1] INTERMEDIARIO
[#120] frameDraws=1121
[#180] frameDraws=2752   ← voltou ao normal
[#780] frameDraws=1396   ← mantendo estável

```

### ✅ Conquistas
- Sem freeze
- Sem crash
- Shader compila + linka + desenha
- VAO dedicado funcional
- Leitura do quad OK

### 🟡 Detalhe
Pixel saiu **amarelo** (R255 G255 B0) em vez de verde (R0 G255 B0).
Isso é vermelho + verde = **blend aditivo ligado** que o jogo deixou.

---

## M24.2.2 — Fix blend ⏳ EM TESTE

### Mudança
Antes de desenhar o quad, `glDisable(GL_BLEND)`; restaura depois.

### Estado atual
⏳ Aguardando log do M24.2.2

### Se der verde puro → M24.2 fechado, partimos pra M24.3
M24.3: modificar o fragment shader pra receber o **shadow map** como 
`sampler2D`, calcular sombra baseada no depth, e escrever o resultado 
no composite FBO.
```
M24.2.2 — Fix do blend ✅ FECHADO

### Mudança
`glDisable(GL_BLEND)` antes do draw; restaura depois.

### Resultado
```

[M24.2.2-TEST] pixel = R0 G255 B0 A255 (blend salvo=0)
[M24.2.2] SUCESSO! Quad verde puro

```

Verde puro, sem crash, sem freeze.

### Conclusão
✅ Pipeline completo de shader próprio funcionando:
- Compila GLSL ES 3.0
- Linka programa
- Cria VAO/VBO isolados
- Desenha quad fullscreen
- Lê resultado via glReadPixels

---

## M24.3 — Depth view (shadow map como imagem) ⏳ EM TESTE

### Objetivo
Criar um segundo fragment shader que:
1. Recebe o shadow map como `sampler2D`
2. Amostra o depth em UV
3. Escreve o valor como cor (grayscale)
4. Desenha no composite FBO

Se aparecer uma imagem com silhuetas/variacao, o shadow map está 
populado. Se ficar tudo preto = vazio. Se tudo branco = só far plane.

### Shader novo
```glsl
// FS_DEPTH
#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uShadowMap;
out vec4 fragColor;
void main() {
    float d = texture(uShadowMap, vUV).r;
    fragColor = vec4(d, d, d, 1.0);
}
```

Lê 3 pontos do composite

· Canto sup-esq (1/8)
· Centro
· Canto inf-dir (7/8)

Se os 3 valores forem diferentes → SUCESSO (tem geometria).

Estado atual

⏳ Aguardando log do M24.3

```
 M24.4 — Diagnóstico da matriz ✅ MATRIZES OK

### Resultado
```

lightProj  = [0.013 0 0 0 | 0 0.013 0 0 | 0 0 -0.007 0 | 0 0 -1.007 1]
lightView  = [0.473 -0.493 0.730 0 | 0.881 0.265 -0.392 0 | 0 0.829 0.559 0 | 61 1443 -2085 1]
g_lightMatValid=1
sun=(0.730, -0.392, 0.559)
cam.pos=(2278, -1292, 24)
Total programas: 8 | ambos Proj/View: 6

```

### Análise
- ✅ Projeção ortográfica válida (range 80)
- ✅ View matrix com eixos corretos (Z = sun, X e Y perpendiculares)
- ✅ Câmera e sol lidos corretamente
- ✅ 6 programas do jogo têm `ProjMatrix` e `ViewMatrix` localizados

**Tudo certo na matriz** — mas shadow map continua vazio.

### Hipóteses restantes
- **A)** `ProjMatrix` do jogo é o **VP combinado** (não só P)
- **B)** Range ortográfico muito pequeno (80 unidades)

---

## M24.5 — Teste de range + modo VP ⏳ EM TESTE

### Mudanças
1. Range da luz aumentado de **80 → 300** (600 unidades)
2. **Dump dos valores ORIGINAIS** de `ProjMatrix`/`ViewMatrix` do jogo
3. **Dois modos de substituição**:
   - `g_lightMode=0` (frame < 300): separado (atual)
   - `g_lightMode=1` (frame >= 300): `ProjMatrix = lightP × lightV`
    M24.6 — Diagnóstico scissor ⏳ DESCARTADO

### Resultado
```

[M24.6-SCISSOR] scissor_test=0 box=[0 0 2400 1080]
[M24.6-STATE] cull=0 depthTest=1 blend=0
[M24.6] #60 | frameDraws=636 reCalls=60

```

- Scissor test está OFF → não é o problema
- ~10 draws por RenderEverything → SUSPEITO

### Conclusão
O `frameDraws` continua baixo. **A cena 3D NÃO está dentro de 
RenderEverythingBarRoads** — está na fila RQ processada depois, 
fora da nossa janela `g_inRenderEverything`.

---

## M24.7 — Captura global de draws ⏳ EM TESTE

### Insight
O `g_inRenderEverything` é setado/limpo na **main thread**. O jogo 
processa a fila RQ **depois** que RenderEverything retorna, então 
quando os draws de verdade acontecem, `g_inRenderEverything` já é 
`false` → não capturamos nada.

### Mudança
Remover a dependência de `g_inRenderEverything`. Capturar **sempre** 
que o programa atual tiver `locProj`/`locView` válidos:

```cpp
if (g_enableShadowPass && !g_inReplay && g_shadowFboId != 0) {
    ProgInfo* pi = FindProg(g_currentProgram);
    if (pi && pi->locProj >= 0 && pi->locView >= 0) {
        g_drawsCaptured++;
        InlineReplayElements(mode, count, type, indices);
    }
}
```

Contadores de debug

· capturados — draws que passaram pelo filtro
· skipped_no_prog — draws sem programa registrado
M24.8 — Fix do registro de programas ✅ SHADOW MAP FUNCIONANDO!!!

### Resultado
```

[M24.3-TEST] drawErr=0x0 readErr=0x0 | canto(1/8)=R255 | centro=R255 | canto(7/8)=R30
[M24.3] SUCESSO! Shadow map tem VARIACAO

[M24.8] #60  | capturados=30088 | skipped_no_prog=5023 | progs_registrados=168
[M24.8] #120 | capturados=31516 | skipped_no_prog=4408 | progs_registrados=168

```

### Conquistas
- ✅ **30 mil draws capturados** por 60 frames (~500/frame — antes era 10)
- ✅ **168 programas registrados** (antes 8)
- ✅ **Shadow map tem geometria real** (canto(7/8)=R30 = near plane)
- ✅ Sem crash, sem freeze

### Causa raiz do problema
Chicken-and-egg: `FindOrAddProg` só era chamado **dentro** de 
`InlineReplayElements`, mas o check `pi && pi->locProj >= 0` rodava 
**antes**. Como `pi` era `null`, pulava → nunca registrava → nunca capturava.

### Fix
1. `glUseProgram_Cap` registra/atualiza `ProgInfo` toda vez que o jogo binda
2. Hooks de draw fazem registro **antes** do check
3. Draw loop funciona globalmente (não depende de `g_inRenderEverything`)

---

## 🎯 Estado arquitetural atual

O mod agora:
1. **Rastreia todos os draws 3D** que passam por programas com `ProjMatrix`/`ViewMatrix`
2. **Replay inline** no FBO de shadow com a matriz da luz substituída
3. **Composite FBO separado** (RGBA8 512x512) funcional
4. **Shader próprio** compilando + linkando + amostrando o shadow map
5. **Shadow map populado** com geometria real da cena

---

## 🚧 Próximo: M25 — Aplicar sombra na cena final

Agora que o shadow map funciona, o **próximo grande objetivo** é 
**aplicar a sombra na cena final do jogo**, não só visualizar o 
shadow map como imagem.

Desafios:
- Reconstruir a posição mundo de cada pixel da tela
- Projetar no espaço da luz
- Comparar depth
- Escurecer os pixels que estão em sombra
```
## M25.2e — Isolamento overlay ✅ DIAGNÓSTICO

### Resultado
| Config | HUD | Tela |
|---|---|---|
| M25.2d: captura OFF, overlay ON | ❌ bugado | ❌ vermelho |
| M25.2e: captura OFF, overlay OFF | ✅ normal | ✅ normal |

**Diferença única: overlay.** Bug do HUD vem do overlay M25.1.

### Hipóteses
- **A)** Estado GL modificado (disable scissor/depth, blend func) que 
  vaza mesmo com save/restore
- **B)** Timing: overlay desenha **no meio** dos draws do HUD, 
  interrompendo a sequência

---

## M25.2f — Overlay silencioso ⏳ EM TESTE

### Mudança
Overlay roda TODA a lógica (salva estado, muda flags, bind textura, 
UseProgram, BindVAO) **mas não desenha** (`p_DrawArrays` skip).

### Objetivo
- **HUD continua bugado** → hipótese A (estado GL)
- **HUD volta ao normal** → hipótese B (timing do draw)
## M25.2k — Fix enums blend GLES ✅ RESOLVIDO!!!

### Bug raiz (o real desde M25.2g)
```cpp
p_GetIntegerv(0x0BD0, &savedBlendSrc);    // ← OpenGL DESKTOP
p_GetIntegerv(0x0BD1, &savedBlendDst);    // ← NÃO existe em GLES
p_GetIntegerv(0x0BD2, &savedBlendSrcA);
p_GetIntegerv(0x0BD3, &savedBlendDstA);
## M25.2l — Captura + overlay ligados ✅ HUD OK

Screenshot confirmou:
- ✅ HUD intacto (radar, vida, munição)
- ✅ Overlay vermelho aparecendo
- ⚠️ Desalinhado (usa UV tela 1:1)

---

## M25.3 — Alinhamento via InvVP ⏳ EM TESTE

### Estratégia
1. Captura `ProjMatrix`/`ViewMatrix` do jogo no `glUniformMatrix4fv_Cap` 
   (fora do replay — pra pegar as originais, não as substituídas)
2. Calcula `VP = Proj × View` e sua `InvVP`
3. Shader overlay:
   - Reconstrói posição mundo do pixel: `world = InvVP * NDC` (assume z=1)
   - Projeta no espaço da luz: `lightPos = LightVP * world`
   - Converte pra UV: `lightUV = lightNDC.xy * 0.5 + 0.5`
   - Amostra shadow map e compara depth
4. Aplica bias `0.005` pra evitar acne

### Limitação
Reconstrói z=1 (far plane) — pixels no chão vão ficar ligeiramente 
deslocados. Pra corrigir 100% precisaria do depth buffer da cena.
## M25.3 — Alinhamento InvVP ⚠️ overlay desapareceu

### Log confirmou setup OK
- locInvVP=0, locLightVP=1, locMap=2 — uniforms todos localizados
- invVP=1 — usando matrizes do jogo
- gameMats=1 — capturadas
- err=0x0 — sem erro GL

### Bug no shader
1. `ndc.z = 1.0` (far plane) → posição mundo a ~3000u
   → fora do frustum ortográfico da luz (range 300)
2. `lightNDC.z` está em [-1,1] mas shadow map guarda em [0,1]
   → comparava coisa errada

---

## M25.4 — Fix do shader ⏳ EM TESTE

### Mudanças
1. `ndc.z = -1.0` (near plane) — posição mundo perto da câmera
2. `lightDepth = lightNDC.z * 0.5 + 0.5` — corrige range
M26.0 — Hooks de shader ✅ FUNCIONANDO

### Resultado
- Todos os hooks instalados OK
- Log mostra shaders sendo criados:
```

[M26.0] glCreateShader(FS) -> 2   sourceLen=262   status=1
[M26.0] glCreateShader(VS) -> 3   sourceLen=443   status=1

```
- Shaders compilando com status=1 (OK)
- Programas sendo montados com attach+link

### Bug
O dump foi salvo em `InitShaderHooks()` antes de qualquer shader 
existir → arquivo ficou vazio.

---

## M26.1 — Dump contínuo + log de conteúdo ⏳ EM TESTE

### Mudanças
1. `DumpShadersToFile()` agora é chamada no frame 600 (10s de jogo)
2. `LogFirstShaders(6)` loga o source dos 6 primeiros shaders direto 
   no log
3. Arquivo de dump agora vai ter os shaders reais
```
## M26.0/M26.1 — Dump de shaders ✅

### Descobertas
117 shaders, todos GLSL ES 1.00 (`#version 100`).
Estrutura típica do VS 3D:
```glsl
#version 100
precision highp float;
uniform mat4 ProjMatrix;
uniform mat4 ViewMatrix;
uniform mat4 ObjMatrix;
void main() {
    vec4 WorldPos = ObjMatrix * vec4(Position,1.0);
    vec4 ViewPos = ViewMatrix * WorldPos;
    gl_Position = ProjMatrix * ViewPos;
    Out_Color = GlobalColor;
}
```

FS típico:

```glsl
precision mediump float;
uniform sampler2D Diffuse;
void main() {
    lowp vec4 fcolor = texture2D(Diffuse, Out_Tex0, -0.5);
    gl_FragColor = fcolor * Out_Color;
}
```

---

M26.2 — Injeção GLSL ⏳ EM TESTE

Estratégia

Interceptar glShaderSource e injetar código GLSL:

No VS 3D (tem ObjMatrix + WorldPos):

· Adiciona uniform mat4 uLightVP; + varying vec4 vLightSpacePos;
· No fim do main: vLightSpacePos = uLightVP * WorldPos;

No FS (tem gl_FragColor):

· Adiciona uniform sampler2D uShadowMap; uniform float uShadowK; varying vec4 vLightSpacePos;
· No fim do main: amostra shadow map, escurece gl_FragColor.rgb

Estado atual

Nesta etapa NÃO aplicamos uniforms ainda — só testamos se o 
GLSL injetado compila sem crashar.

Se funcionar → M26.3 aplica os uniforms
## M26.2 — Injeção GLSL ✅ FUNCIONA

Todos os 117 shaders injetados compilam com status=1.
GLSL injetado é válido.

---

## M26.3 — Aplicar uniforms ⏳ EM TESTE

### Mudança
1. `shader_hooks` expõe `SetLightMatrices`, `SetShadowTextureId`, 
   `ApplyShadowUniforms`
2. `mobile_render` chama `ApplyShadowUniforms(program)` antes de cada draw
3. Shader injetado tem:
   - `uLightVP` (mat4) = lightProj * lightView
   - `uShadowMap` (sampler) = textura do shadow map (unit 7)
   - `uShadowK` (float) = 0.7 (intensidade)

### Como funciona
- Antes de cada `glDrawElements`, aplica os uniforms no programa atual
- Se o programa não tem esses uniforms (UI, etc.), função retorna early
- Sombra só aparece nos shaders 3D injetados

### Desliga overlay debug
`g_overlayEnabled = false`

### Limitação conhecida
Shadow map é populado DURANTE o frame. Ao desenhar a cena, o shadow map 
pode estar parcialmente vazio → sombras parciais. Fix em M26.4 (usar 
shadow map do frame anterior).
# ============================================================
# ZyZ SHADOWS 32-BIT — Estado Atual (M26.19)
# ============================================================

## 🎯 Status geral

✅ **Pipeline de sombra FUNCIONAL** — o mod aplica sombras nos shaders do jogo.
⚠️ **Ajustes finos pendentes** — sombras faltando em alguns objetos, cobertura limitada.
✅ **HUD intacto**, sem crashes, sem glitch.
✅ **117 shaders** capturados do jogo, **79 VS + 27 FS** injetados com sucesso.

---

## 🏗️ Arquitetura atual

### Arquivos do projeto
- `main.cpp` — entrada do mod (AML)
- `mod/amlmod.h`, `mod/logger.h`, etc — libs do AML
- `mod/sombras/hooks.cpp/.h` — hooks de FBO (tracking, tracking de binds)
- `mod/sombras/shadow_pass.cpp/.h` — gerencia o FBO do shadow map
- `mod/sombras/mobile_render.cpp/.h` — orquestra replay inline + overlay debug
- `mod/sombras/shader_hooks.cpp/.h` — **NOVO** — hooks de glCreateShader/glShaderSource/glCompileShader e injeção de código GLSL
- `mod/sombras/light_mat.h` — matrizes de luz (View, Ortho, Inverse, Mult)
- `mod/sombras/cam.h` — snapshot da câmera do jogo
- `mod/sombras/sun.h` — direção do sol do jogo (CTimeCycle)
- `mod/sombras/zyzlog.h` — logger

---

## 🧠 Como funciona (visão geral)

1. **Hook em CPostEffects::MobileRender** — marca início de frame.
2. **Hook em CRenderer::RenderEverythingBarRoads** — marca cena 3D sendo desenhada.
3. **Para cada glDrawElements/glDrawArrays:**
   - Se for draw 3D (ProjMatrix perspectiva, não UI):
     - **Shadow pass**: rebobina o draw no FBO 1024×1024 com a matriz da luz
     - **Main pass**: aplica uniformes `uLightVP`, `uShadowMap`, `uShadowK` no shader do jogo
4. **Injeção GLSL em tempo real** (M26.x):
   - No VS (se tem `ObjMatrix` + `WorldPos`): adiciona `vLightSpacePos = uLightVP * WorldPos`
   - No FS (se tem `gl_FragColor` + `sampler2D`): amostra `uShadowMap`, compara depth, escurece `gl_FragColor.rgb`
5. **Ordem correta**: as matrizes da luz são setadas **antes** do shadow pass rodar, garantindo consistência.

---

## 📋 Milestones alcançados

| Milestone | Descrição | Status |
|---|---|---|
| M1-M23 | Captura + FBO + replay + shadow map populado | ✅ |
| M24 | Shadow map 1024×1024 populado corretamente | ✅ |
| M25 | Overlay debug visualizável (sem bugar HUD) | ✅ |
| **M26.0** | Hooks de shader (glCreateShader/glShaderSource/glCompileShader) | ✅ |
| **M26.1** | Dump de todos os shaders do jogo em arquivo | ✅ |
| **M26.2** | Injeção GLSL básica (compila sem crashar) | ✅ |
| **M26.3** | Aplicação de uniforms (uLightVP/uShadowMap/uShadowK) | ✅ |
| **M26.4** | Filtro FS 3D (só injeta se tem sampler2D) | ✅ |
| **M26.5** | Filtro FS mais seletivo | ✅ |
| **M26.6** | Reversão automática de FS órfão (sem VS pareado) | ✅ |
| **M26.7** | Debug visual (pintar _sD e _sd) | ✅ |
| **M26.8** | Force shadowK=0 no shadow pass (evita feedback loop) | ✅ |
| **M26.9** | Shadow map persistente (não limpa todo frame) | ⚠️ Causou bug |
| **M26.10** | Sun forçado no zênite (teste) | ✅ |
| **M26.11** | Sombras reais aparecem pela 1ª vez | ✅ |
| **M26.12** | Ajuste fino sun/range | ✅ |
| **M26.13** | FIX: eye da luz ACIMA da câmera (era abaixo) | ✅ |
| **M26.14** | Snap de texels (causou flickering) | ⚠️ |
| **M26.15** | Matrizes consistentes entre shadow/main pass | ✅ |
| **M26.16** | Bias maior + w>0 + UV margem | ✅ |
| **M26.17** | Fade smooth nas bordas do frustum | ✅ |
| **M26.18** | Revert do M26.9 (limpa todo frame) | ✅ |
| **M26.19** | Remove snap + fade 30% | ✅ |

---

## 🔑 Descobertas importantes

### Sobre o jogo
- GTA SA 2.00 mobile usa GLSL ES 1.00 (`#version 100`)
- **117 shaders criados** ao longo da execução
- Shaders 3D têm `ObjMatrix`, `WorldPos`, `ProjMatrix`, `ViewMatrix`
- Shaders 2D/UI não têm esses uniforms
- FS 3D típico tem `sampler2D Diffuse` e `gl_FragColor`
- O sol do jogo (`CTimeCycle::m_VectorToSun`) pode vir do **subsolo** (y negativo) — precisa forçar y positivo

### Sobre o driver Adreno (Qualcomm)
- **glReadPixels de DEPTH não funciona** em FBO depth-only (tentado 6 combos — todos falharam com `err=0x502`)
- **Cor funciona**: `glReadPixels(RGBA, UNSIGNED_BYTE)` retorna `err=0x0`
- **glReadBuffer(GL_NONE)** dá `INVALID_ENUM` (só aceita COLOR_ATTACHMENT0)
- IDs de FBO e texturas são reciclados pelo driver (precisa re-detectar e recriar)
- `glGenTextures` na thread errada retorna 0 silenciosamente

### Sobre o threading model
- **Main thread** (RenderEverythingBarRoads): sem contexto GL
- **Render thread** (glDrawElements): contexto GL ativo
- Toda operação GL de setup (criar shader, criar textura) DEVE rodar na thread de render

### Sobre enums do GLES
- **CUIDADO**: enums do OpenGL desktop NÃO funcionam no GLES
- `GL_BLEND_SRC_RGB` = 0x80C9 (não 0x0BD1)
- `GL_BLEND_DST_RGB` = 0x80C8 (não 0x0BD0)
- `GL_BLEND_SRC_ALPHA` = 0x80CB (não 0x0BD2)
- `GL_BLEND_DST_ALPHA` = 0x80CA (não 0x0BD3)
- Enums inválidos em `glGetIntegerv` deixam o buffer zerado silenciosamente

### Sobre o mod original ZyZGfx64
- Hookeia `ShUniformMatrix4fv` pra capturar matrizes do shader
- Injeta código de sombra nos shaders do jogo
- Usa depth buffer da cena (`g_D`)
- Combina shadow map 1024² + contact shadows screen-space (ray march 8 steps)
- Uniforms: `uInv`, `uShadowK`, `ShadowMapView`

---

## 📁 Arquivos de dump gerados

- `/sdcard/Download/zyzshadows.log` — log principal
- `/sdcard/Download/zyzshadows_shaders.txt` — dump dos shaders compilados

---

## 🐛 Bugs conhecidos e fixes

### Bug: HUD preto após M24.8
**Causa:** capture global pegava também shaders 2D. Correção: filtro `sampler2D` no FS.

### Bug: overlay com estado GL sujo
**Causa:** não salvava/restaurava textura, blend separado, ordem active texture. Várias correções incrementais (M25.2a-M25.2k).

### Bug: FBO do jogo colidindo com o nosso
**Causa:** driver Qualcomm recicla IDs. Correção: `TryProcessRecreate` (M35).

### Bug: blend função corrompendo HUD
**Causa:** enums do desktop usados em GLES. Correção: enums corretos do GLES (M25.2k).

### Bug: `glGenTextures = 0`
**Causa:** chamada na thread errada. Correção: recriação via `TryProcessRecreate` na render thread (M35).

### Bug: sombra escura em tudo (M26.x)
**Causa:** matrizes inconsistentes entre shadow pass e main pass. Correção: `ApplyShadowUniforms` mesmo durante replay (M26.15).

### Bug: eye da luz abaixo do chão
**Causa:** `BuildLightView` subtraía `sunDir * height`. Correção: soma (M26.13).

### Bug: flickering das sombras
**Causa:** snap em grid de texels movendo o eye entre frames. Correção: remove snap (M26.19).

---

## ⚠️ Problemas ATUAIS (pendentes)

### Problema 1: Sombras faltando em objetos
**Sintoma:** casas, prédios, árvores e objetos de cenário **não têm sombra própria** (só uns poucos objetos).

**Hipóteses:**
- **A)** Bias `0.03` muito grande → sombras finas desaparecem
- **B)** Frustum `range=400` → cada texel cobre 0.78 unidades → sombras pequenas somem
- **C)** FS de alguns objetos (carros, CJ) não passou no filtro `sampler2D` → não injetado

**Ações sugeridas pro próximo passo:**
1. Reduzir `range` de 400 → 200
2. Reduzir `bias` de 0.03 → 0.01
3. Aumentar `SHADOW_STRENGTH` de 0.55 → 0.7
4. Verificar log: quantos FS foram injetados vs quantos existem

### Problema 2: Borda serrilhada do frustum
**Sintoma:** o limite do frustum da luz fica visível como uma "escadinha" no chão.

**Ações sugeridas:**
- Aumentar fade de 0.30 → 0.40
- Ou implementar **cascaded shadow maps (CSM)** — 2-3 shadow maps de ranges diferentes

### Problema 3: Sombras "nadam" quando o CJ anda
**Sintoma:** sem snap, as sombras deslizam pela cena em vez de ficarem fixas.

**Ações sugeridas:**
- Implementar snap **suave** (interpolação entre texels)
- Ou usar `glScissor` pra forçar grid fixo no mundo

---

## 🎯 Próximos passos sugeridos

### Curto prazo (ajuste fino)
1. **M26.20** — Reduzir range e bias, aumentar strength
2. **M26.21** — Verificar quais FS não foram injetados
3. **M26.22** — Ajustar fade das bordas

### Médio prazo (features)
1. **M27** — Contact shadows (screen-space ray march)
2. **M28** — Cascaded shadow maps (2-3 cascatas)
3. **M29** — PCF (sombras suaves nas bordas)

### Longo prazo (polimento)
1. Config file pro usuário ajustar range/strength
2. Detecção automática de qualidade (low/medium/high)
3. Suporte a sombras dinâmicas (carros, peds)

---

## 🔧 Parâmetros atuais (M26.19)

**No `mobile_render.cpp`** (`UpdateLightMatrices`):
```cpp
if (sun.y < 0.5f) sun.y = 0.5f;
auto lm = BuildLightMatrices(cam, sun, 400.0f, 250.0f, 1.0f, 700.0f);
//                          range=400, height=250, near=1, far=700