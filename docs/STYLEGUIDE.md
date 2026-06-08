# STYLEGUIDE.md

> Mantido por: `style-guardian`. Remova este arquivo se não houver frontend.

## Paleta de cores

| Token | Valor | Uso |
|---|---|---|
| `color-primary` | `<ex.: #3B82F6>` | Botões, links, destaques |
| `color-secondary` | `<ex.: #6B7280>` | Subtítulos, bordas |
| `color-danger` | `<ex.: #EF4444>` | Erros, ações destrutivas |
| `color-success` | `<ex.: #22C55E>` | Confirmações, estados de sucesso |
| `color-background` | `<ex.: #F9FAFB>` | Fundo da página |
| `color-surface` | `<ex.: #FFFFFF>` | Cards, modais |
| `color-text` | `<ex.: #111827>` | Texto principal |

## Tipografia

| Token | Valor | Uso |
|---|---|---|
| `font-family` | `<ex.: Inter, sans-serif>` | Todo o texto |
| `font-size-base` | `<ex.: 16px>` | Texto do corpo |
| `font-size-sm` | `<ex.: 14px>` | Labels, legendas |
| `font-size-lg` | `<ex.: 20px>` | Títulos de seção |
| `font-size-xl` | `<ex.: 24px>` | Títulos de página |

## Escala de espaçamento

`4px · 8px · 12px · 16px · 24px · 32px · 48px · 64px`

## Breakpoints

| Nome | Largura mínima | Alvo |
|---|---|---|
| Mobile | 360 px | Smartphones |
| Tablet | 768 px | Tablets, laptops pequenos |
| Desktop | 1280 px | Telas completas |

## Padrões de componentes

### Botões

- Primário: preenchido com `color-primary`, texto branco, raio 8 px
- Secundário: borda com `color-secondary`, sem preenchimento
- Perigo: preenchido com `color-danger`, texto branco
- Área mínima de toque: 44 × 44 px

### Estados

| Estado | Tratamento visual |
|---|---|
| Carregando | Spinner ou skeleton; interação desabilitada |
| Erro | Mensagem em `color-danger` abaixo do elemento |
| Vazio | Mensagem centralizada + botão de ação opcional |
| Sucesso | Feedback em `color-success`, auto-dismiss após 3 s |

## Proibido

- Não hardcode cores ou espaçamentos fora dos tokens.
- Não crie novo padrão visual sem atualizar este arquivo.
- Não use mais de dois pesos de fonte por tela.
