# 🎤 Oracle CC Narrator

> Extensão para Google Chrome que lê em voz alta as legendas dos cursos **Oracle MyLearn** — tradução automática para PT-BR incluída, sincronizada em tempo real com o player.

![Status](https://img.shields.io/badge/status-beta-yellow) ![Versão](https://img.shields.io/badge/vers%C3%A3o-2.0.0-blue) ![Manifest](https://img.shields.io/badge/manifest-v3-blue) ![Licença](https://img.shields.io/badge/licen%C3%A7a-MIT-green)

---

## 📌 O que é isso?

Os cursos do Oracle MyLearn são em inglês. Essa extensão lê as legendas do vídeo, traduz para português em tempo real e narra em voz alta — sincronizada ao segundo exato do vídeo.

**Funciona assim:**
- Você assiste o vídeo normalmente
- A extensão lê a legenda do momento exato em que o vídeo está
- Se você voltar 30 segundos, o narrador volta junto
- Se você pausar, o narrador para na hora
- Se você avançar, o narrador acompanha sem atrasar nem adiantar

### 🚀 Funcionalidades

- ▶️ **Botão liga/desliga** com memória de estado (lembra se estava ligado)
- 🔊 **Seletor de voz** — vozes PT-BR nativas do seu browser
- 🌎 **Seletor de idioma** — detecta automático ou você fixa (inglês, espanhol etc.)
- ⏩ **Velocidade ajustável** — de 0.5× a 2.0×
- 🔉 **Volume independente** do vídeo
- 📺 **Display de legenda** no popup: mostra o texto original e a tradução em tempo real
- 🔄 **Cache de tradução** — pré-traduz todos os cues ao carregar o vídeo, zero delay
- 🛑 **Sincronização perfeita** — guiada pelo `currentTime` do player, não por fila

---

## 🖥️ Requisitos

- **Google Chrome** versão 116 ou superior (ou Brave, Edge baseado em Chromium)
- Windows, macOS ou Linux
- Acesso ao [Oracle MyLearn](https://mylearn.oracle.com)

> **Obs. sobre vozes:** o Chrome usa as vozes instaladas no seu sistema operacional. No Windows 10/11 já vem vozes PT-BR por padrão. Se não sair áudio, veja a seção [Vozes](#-vozes) no final.

---

## ⚡ Instalação (passo a passo)

### Passo 1 — Baixar o projeto

Você tem duas opções:

**Opção A — Via Git (recomendado para quem já tem Git instalado)**

Abra o terminal e rode:
```bash
git clone https://github.com/Victoredbr21/dublador-e-tradutor-cc.git
```

**Opção B — Download ZIP (mais fácil para quem não usa Git)**

1. Nesta página do GitHub, clique no botão verde **`<> Code`**
2. Clique em **`Download ZIP`**
3. Salve o arquivo em algum lugar fácil de achar (ex: Área de trabalho)
4. Clique com o botão direito no arquivo ZIP → **Extrair tudo...**
5. Escolha onde extrair e clique em **Extrair**

Você vai ter uma pasta chamada `dublador-e-tradutor-cc-main` (ou similar).

> ⚠️ **Importante:** não delete essa pasta depois. A extensão precisa dela para funcionar.

---

### Passo 2 — Abrir as configurações de extensões do Chrome

1. Abra o **Google Chrome**
2. Na barra de endereços (onde você digita sites), apague o que estiver escrito
3. Digite exatamente isso e aperte **Enter**:
   ```
   chrome://extensions
   ```

Você vai cair nessa tela:

```
┌──────────────────────────────────────────────────────┐
│ Extensões                                          │
│                          Modo do desenvolvedor: [ ] │
└──────────────────────────────────────────────────────┘
```

---

### Passo 3 — Ativar o Modo do Desenvolvedor

No **canto superior direito** da tela de extensões, você vai ver **"Modo do desenvolvedor"** com um toggle ao lado.

Clique nesse toggle para ativar. Ele vai ficar azul/verde.

```
Antes:  Modo do desenvolvedor: [ ]
 Depois: Modo do desenvolvedor: [✓]
```

Depois de ativar, três botões novos vão aparecer no topo da página:
- **Carregar sem compactação** ← esse é o que vamos usar
- Compactar extensão
- Atualizar

---

### Passo 4 — Carregar a extensão

1. Clique em **"Carregar sem compactação"**
2. Uma janela do explorador de arquivos vai abrir
3. Navegue até a pasta que você baixou/extraiu no Passo 1
4. **Atenção:** dentro dessa pasta tem uma subpasta chamada **`extension`** — selecione ela, não a pasta de fora

```
dublador-e-tradutor-cc/          ← NÃO selecione essa
└── extension/                   ← Selecione ESSA
    ├── manifest.json
    ├── content.js
    ├── popup.html
    └── ...
```

5. Clique em **"Selecionar pasta"**

Se deu certo, a extensão **Oracle CC Narrator** vai aparecer na lista com um card.

---

### Passo 5 — Fixar o ícone na barra do Chrome

Para não ficar procurando toda hora:

1. Clique no ícone de peça de quebra-cabeça **🧩** que aparece na barra do Chrome (ao lado da barra de endereço, no canto direito)
2. Vai aparecer a lista de extensões instaladas
3. Encontre **Oracle CC Narrator**
4. Clique no 📌 (alfinete/pin) ao lado do nome

O ícone da extensão vai aparecer fixo na barra — é por ele que você abre o painel.

---

## 🎧 Como usar (dia a dia)

### 1. Abre o curso no Oracle MyLearn

Entre em [mylearn.oracle.com](https://mylearn.oracle.com), escolha um curso com vídeo e abra uma aula.

---

### 2. Ligue as legendas (CC) no player

Esse passo é obrigatório. A extensão lê as legendas do player — se elas estiverem desligadas, não tem o que ler.

Procure o botão **`CC`** na barra de controles do player de vídeo e clique nele para ativar as legendas.

```
[ ►  ]  [🔉]  [0:23 / 4:15]  [CC]  [⛶]  ← clique aqui
```

---

### 3. Clique na página antes de dar play

O Chrome bloqueia áudio automático se você não interagiu com a página. Antes de ligar o narrador, **clique em qualquer lugar da página** (não precisa ser no vídeo, pode ser em qualquer texto).

---

### 4. Ligue o narrador

Clique no ícone da extensão na barra do Chrome para abrir o painel, e pressione o **botão redondo** (Master Switch).

```
┌──────────────────────────────┐
│ 🎤 Oracle CC Narrator  [►] │  ← vermelho = desligado
│ 🔴 Desativado              │
└──────────────────────────────┘

┌──────────────────────────────┐
│ 🎤 Oracle CC Narrator [II] │  ← verde = narrador ativo
│ 🟢 Aguardando legenda...   │
└──────────────────────────────┘
```

Agora dê play no vídeo. O narrador começa a falar junto com as legendas 🎉

---

### 5. Ajustar as configurações (opcional)

Dentro do painel da extensão você pode configurar:

| Opção | O que faz | Recomendado |
|--------|-----------|-------------|
| **Voz** | Qual voz vai narrar | Selecione uma voz PT-BR |
| **Idioma da legenda** | Idioma do vídeo original | Deixe "Detectar auto" ou fixe em "Inglês" |
| **Velocidade** | Quão rápido o narrador fala | 1.1× a 1.3× é confortável |
| **Volume** | Volume do narrador | 100% |

> 💡 **Dica:** se você sabe que o curso é em inglês, fixe o idioma como **"Inglês (en)"**. Fica mais rápido.

---

## 🔄 Comportamento de sincronização

A partir da v2.0.0, o narrador é guiado pelo `currentTime` do vídeo:

| Situação | O que acontece |
|-----------|----------------|
| Vídeo rodando normal | Narrador fala exatamente a legenda que está na tela |
| Você pausa o vídeo | TTS para imediatamente |
| Você volta 30 segundos | Narrador recua e reconta a partir daquele ponto |
| Você avança com seek | Narrador pula direto para a nova posição |
| Você aumenta a velocidade (1.5×, 2×) | Sincronização continua perfeita |

---

## 🔍 Verificando se a extensão detectou o vídeo

Se quiser confirmar que está tudo funcionando, aperte **F12** na página do curso, vá na aba **Console** e filtre por `[Oracle CC]`.

Você deve ver algo assim:

```
[Oracle CC] Content script iniciado (v2.0.0).
[Oracle CC] videoScanObserver ativo.
[Oracle CC] Video anexado.
[Oracle CC] TextTrack: lang="en" label="English"
[Oracle CC] Cache de tradução pré-aquecido para track "English".
[Oracle CC] Loop rAF iniciado.
```

Se **não aparecer nada** com `[Oracle CC]`, veja a seção de problemas abaixo.

---

## 🔊 Vozes

### Windows 10 / 11

As vozes PT-BR já vem instaladas por padrão na maioria das máquinas. Se não aparecer nenhuma voz em português no seletor da extensão:

1. Abra o menu **Iniciar** e pesquise **"Configurações de fala"**
2. Vá em **Hora e idioma** → **Fala**
3. Em **"Vozes"**, clique em **"Adicionar vozes"**
4. Pesquise **"Português (Brasil)"** e instale
5. Reinicie o Chrome

### macOS

1. Abra **Preferências do Sistema** (ou Ajustes do Sistema no macOS 13+)
2. Vá em **Acessibilidade** → **Conteúdo Falado**
3. Clique em **Gerenciar Vozes** e adicione vozes PT-BR

### Linux

```bash
sudo apt install espeak-ng
```

---

## 🐛 Problemas comuns

| Sintoma | Causa provável | Solução |
|---------|---------------|----------|
| Nenhum áudio sai | Voz PT-BR não instalada no SO | Instalar voz conforme seção [Vozes](#-vozes) |
| Legenda não detectada | CC do player está desligado | Ativar botão CC no player do vídeo |
| Console não mostra `[Oracle CC]` | Extensão não carregou na página | Verificar se a extensão está ativa e a URL é `mylearn.oracle.com` |
| Tradução falhou | Sem internet ou Google Translate bloqueado | Narrador fala o texto original como fallback |
| Erro `not-allowed` no console | Autoplay bloqueado pelo Chrome | Clicar em qualquer lugar da página antes do play |
| Extensão atualizada mas não funcionou | Cache do content script antigo | `chrome://extensions` → botão 🔄 na extensão |
| Narrador fala em inglês | Legenda já é PT ou idioma errado detectado | Fixar idioma como **Inglês (en)** no seletor |

---

## 🛠️ Arquitetura (para curiosos)

```
dublador-e-tradutor-cc/
└── extension/
    ├── manifest.json     ← Manifest V3, permissões mínimas
    ├── content.js        ← Loop rAF + TextTrack API + tradução
    ├── background.js     ← Service worker: executa chrome.tts
    ├── popup.html        ← Interface do popup
    ├── popup.js          ← Gravador de config (zero sendMessage)
    ├── styles.css        ← Dark theme
    └── icons/            ← Ícones 16/48/128px
```

### Fluxo de dados (v2.0.0)

```
[Oracle MyLearn — Brightcove Player]
        │
        │ bootObservers() — sobe no load
        │
        └── videoScanObserver detecta <video> dinâmico
              └── attachVideo() → attachTrack()
                    └── warmUpTrackCache() — pré-traduz todos os cues

  [Usuário liga o toggle]
        │ isEnabled = true
        ▼
  [Loop requestAnimationFrame — ~60fps]
        │ le video.currentTime
        │ busca VTTCue cujo startTime <= now < endTime
        │ se cue mudou → speak()
        │ se video.paused → chrome.tts.stop()
        ▼
  [speak(rawText)]
        1. resolveLang() — detecta ou usa idioma fixo
        2. translateToPT() — busca no cache (já aquecido) ou faz fetch
        3. sendMessage({ type: "SPEAK", text, voice, rate, volume })
        ▼
  [background.js — Service Worker]
        1. resolveVoice() — separa lang e voiceName corretamente
        2. chrome.tts.speak()
        3. onEvent("end") → sendMessage({ type: "TTS_DONE" })
        ▼
  [popup.js]
        storage.onChanged → exibe legenda original e tradução em tempo real
```

---

## 🛡️ Privacidade

- Os textos das legendas são enviados **apenas** para `translate.googleapis.com` (o mesmo endpoint do Google Tradutor púблico, sem autenticação)
- Nenhum dado é enviado para servidores externos além desse
- A extensão não monitora sua navegação, não acessa sua conta Oracle e não tem analytics
- Toda configuração fica salva localmente no `chrome.storage.local`

---

## 📝 TODO (próximos passos)

- [ ] Empacotar como `.crx` para instalação sem modo desenvolvedor
- [ ] Publicar na Chrome Web Store
- [ ] Suporte a outros players (Coursera, Udemy)

---

## 📜 Licença

MIT — veja [LICENSE](LICENSE) para detalhes.

---

<sub>Feito com ☕ e muito Oracle por <a href="https://github.com/Victoredbr21">Victor Eduardo Meireles</a></sub>
