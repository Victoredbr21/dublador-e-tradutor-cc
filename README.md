# 🎤 Oracle CC Narrator

> Extensão para Google Chrome / Brave que lê em voz alta as legendas dos cursos **Oracle MyLearn** — tradução automática para PT-BR incluída, sincronizada em tempo real com o player.

![Status](https://img.shields.io/badge/status-beta-yellow) ![Versão](https://img.shields.io/badge/vers%C3%A3o-1.8.0-blue) ![Manifest](https://img.shields.io/badge/manifest-v3-blue) ![Licença](https://img.shields.io/badge/licen%C3%A7a-MIT-green)

---

## 📌 O que é isso?

Os cursos do Oracle MyLearn são em inglês. Essa extensão lê as legendas do vídeo, traduz para português em tempo real e narra em voz alta — sincronizada ao segundo exato do vídeo.

**Funciona assim:**
- Você assiste o vídeo normalmente
- A extensão detecta a legenda do momento exato em que o vídeo está
- Traduz automaticamente para PT-BR e narra em voz alta
- Se você pausar, o narrador para imediatamente
- Se você adiantar ou retroceder, o narrador acompanha

### 🚀 Funcionalidades

- ▶️ **Botão liga/desliga** com memória de estado
- 🔊 **Seletor de voz** — vozes PT-BR nativas do seu browser
- 🌎 **Seletor de idioma** — detecta automático ou você fixa (inglês, espanhol etc.)
- 🔉 **Volume independente** do vídeo
- 📺 **Display de legenda** no popup: mostra o texto original e a tradução em tempo real
- 🔄 **Cache de tradução** — evita requisições repetidas ao Google Translate
- 🛑 **Fila inteligente** — o narrador sempre fala a legenda do presente, nunca acumula atraso

---

## ⚙️ Configuração obrigatória antes de usar

> Esta seção é a mais importante. Pule esses passos e o narrador **não vai funcionar corretamente**.

### Passo A — Ativar a legenda em Português no player

O narrador depende da legenda do player para funcionar. Você precisa **configurar manualmente** a legenda para Português antes de ligar a extensão.

**Como fazer:**

1. Abra o vídeo no Oracle MyLearn
2. Clique no botão **CC** na barra de controles do player para abrir as opções de legenda
3. No menu que aparece no canto direito, selecione **`Português`**
4. A legenda em português vai aparecer no vídeo — confirme que está funcionando antes de ligar o narrador

> 💡 Com a legenda já em PT, selecione **"Português (sem traduzir)"** no seletor de idioma da extensão para uma experiência ainda mais fluida — o narrador lê direto sem precisar acionar o Google Translate.

![Configuração da legenda PT no player Oracle](docs/oracle_cc_setup.jpg)

*Configure a legenda para Português no player antes de ligar o narrador*

---

### Passo B — ⚠️ VELOCIDADE DO VÍDEO: MANTER SEMPRE EM 1×

<h3 align="left"><span style="color:red">⚠️🚨 ATENÇÃO: NÃO ALTERE A VELOCIDADE DO VÍDEO</span></h3>

> ### <span style="color:red">⚠️ **NUNCA altere a velocidade do player para 1.5×, 2× ou qualquer valor diferente de 1×.**</span>
>
> **Manter o player em 1× é obrigatório para o narrador funcionar corretamente.**
>
> O narrador fala na velocidade interna de **2× (hardcoded)** — isso já é suficiente para acompanhar o ritmo da fala. Se você aumentar a velocidade do vídeo também, as legendas chegam mais rápido do que o narrador consegue processar, causando:
> - 🔇 Palavras e frases inteiras sendo cortadas
> - 🔀 Narrador completamente fora de sincronia
> - ❌ Experiência ruim e ininteligível

**✅ Configuração correta:** velocidade do player = **1×** | velocidade do narrador = **2× (automático)**

---

## 🖥️ Requisitos

- **Google Chrome** versão 116 ou superior (ou **Brave**, Edge baseado em Chromium)
- Windows, macOS ou Linux
- Acesso ao [Oracle MyLearn](https://mylearn.oracle.com)

> **Obs. sobre vozes:** o Chrome usa as vozes instaladas no seu sistema operacional. No Windows 10/11 já vem vozes PT-BR por padrão. Se não sair áudio, veja a seção [Vozes](#-vozes) no final.

---

## ⚡ Instalação (passo a passo)

### Passo 1 — Baixar o projeto

Você tem duas opções:

**Opção A — Via Git (recomendado para quem já tem Git instalado)**

```bash
git clone https://github.com/Victoredbr21/dublador-e-tradutor-cc.git
```

**Opção B — Download ZIP (mais fácil para quem não usa Git)**

1. Nesta página do GitHub, clique no botão verde **`<> Code`**
2. Clique em **`Download ZIP`**
3. Salve em algum lugar fácil de achar (ex: Área de trabalho)
4. Clique com o botão direito no ZIP → **Extrair tudo...** → Extrair

Você vai ter uma pasta chamada `dublador-e-tradutor-cc-main` (ou similar).

> ⚠️ **Importante:** não delete essa pasta depois. A extensão precisa dela para funcionar.

---

### Passo 2 — Abrir as configurações de extensões do Chrome

1. Abra o **Google Chrome** (ou Brave)
2. Na barra de endereços, digite e pressione **Enter**:
   ```
   chrome://extensions
   ```

---

### Passo 3 — Ativar o Modo do Desenvolvedor

No **canto superior direito** da tela de extensões, ative o toggle **"Modo do desenvolvedor"**.

Após ativar, três botões vão aparecer:
- **Carregar sem compactação** ← esse é o que vamos usar
- Compactar extensão
- Atualizar

---

### Passo 4 — Carregar a extensão

1. Clique em **"Carregar sem compactação"**
2. Navegue até a pasta baixada no Passo 1
3. **Atenção:** selecione a subpasta **`extension`**, não a pasta de fora:

```
dublador-e-tradutor-cc/          ← NÃO selecione essa
└── extension/                   ← Selecione ESSA
    ├── manifest.json
    ├── content.js
    ├── popup.html
    └── ...
```

4. Clique em **"Selecionar pasta"**

Se deu certo, o card **Oracle CC Narrator** vai aparecer na lista. ✅

---

### Passo 5 — Fixar o ícone na barra

1. Clique no ícone de peça de quebra-cabeça 🧩 ao lado da barra de endereço
2. Encontre **Oracle CC Narrator** na lista
3. Clique no 📌 para fixar o ícone

---

## 🎧 Como usar (fluxo recomendado)

> ⚠️ **Leia com atenção — a ordem dos passos importa para o narrador funcionar corretamente.**

### 1. Abra o curso no Oracle MyLearn

Entre em [mylearn.oracle.com](https://mylearn.oracle.com), escolha um curso com vídeo e abra uma aula.

---

### 2. Configure a legenda para Português (obrigatório)

Siga o **[Passo A da seção de configuração](#passo-a--ativar-a-legenda-em-português-no-player)** acima antes de continuar.

---

### 3. Dê play no vídeo primeiro

> 💡 **Dica importante:** ligue o narrador **depois** de dar play no vídeo, não antes.
>
> Se você ligar o narrador antes do play, o player ainda não está ativo e o narrador pode começar a processar as legendas fora de sincronia. Dando play primeiro e depois ligando o narrador, a sincronização é perfeita desde o início.

---

### 4. Ligue o narrador

Clique no ícone da extensão na barra do Chrome para abrir o painel, e pressione o **botão redondo** (Master Switch).

```
┌──────────────────────────────┐
│ 🎤 Oracle CC Narrator  [►] │  ← vermelho = desligado
│ 🔴 Desativado              │
└──────────────────────────────┘

          ↓ clique no botão ↓

┌──────────────────────────────┐
│ 🎤 Oracle CC Narrator [II] │  ← verde = narrador ativo
│ 🟢 Aguardando legenda...   │
└──────────────────────────────┘
```

O narrador vai começar a falar junto com as legendas. 🎉

---

### 5. Ajustar configurações (opcional)

| Opção | O que faz | Recomendado |
|--------|-----------|-------------|
| **Voz** | Qual voz vai narrar | Selecione uma voz PT-BR |
| **Idioma da legenda** | Idioma do vídeo original | "Português (sem traduzir)" se configurou legenda PT no player |
| **Volume** | Volume do narrador | 100% |

> 💡 **Dica:** se configurou a legenda do player para Português, selecione **"Português (sem traduzir)"** no idioma da extensão. Fica mais rápido pois pula a tradução automática.

---

## 🔄 Comportamento de sincronização

| Situação | O que acontece |
|-----------|----------------|
| Vídeo rodando normalmente (1×) | Narrador fala exatamente a legenda que está na tela |
| Você pausa o vídeo | TTS para imediatamente |
| Você avança com seek | Narrador pula para a nova posição |
| Você retrocede | Narrador recua junto |
| ❌ Vídeo em velocidade 1.5× ou 2× | Narrador perde sincronia — **não faça isso** |

---

## 🐛 Problemas comuns e como resolver

| Sintoma | Causa provável | Solução |
|---------|---------------|----------|
| Nenhum áudio sai | Voz PT-BR não instalada no SO | Instalar voz conforme seção [Vozes](#-vozes) |
| Legenda não detectada | CC do player está desligado | Ativar botão CC no player e selecionar Português |
| Narrador come palavras | Velocidade do vídeo acima de 1× | **Manter vídeo sempre em 1×** |
| Tradução falhou | Sem internet ou Google Translate bloqueado | Narrador fala o texto original como fallback |
| Erro `not-allowed` no console | Autoplay bloqueado pelo browser | Clicar em qualquer lugar da página antes do play |
| Extensão atualizada mas não funcionou | Cache do content script antigo | `chrome://extensions` → botão 🔄 na extensão |

### ⚠️ Narrador falando em inglês ou dessincronizado?

Isso pode acontecer quando o narrador é ligado antes do vídeo estar tocando, ou em algumas transições de vídeo. A solução é simples:

**Pause o vídeo e dê play novamente.**

O narrador reinicia a sincronização automaticamente ao retomar o vídeo.

---

## 🔊 Vozes

### Windows 10 / 11

As vozes PT-BR já vêm instaladas na maioria das máquinas. Se não aparecer nenhuma voz em português no seletor:

1. Abra o menu **Iniciar** e pesquise **"Configurações de fala"**
2. Vá em **Hora e idioma** → **Fala**
3. Em **"Vozes"**, clique em **"Adicionar vozes"**
4. Pesquise **"Português (Brasil)"** e instale
5. Reinicie o Chrome

### macOS

1. Abra **Preferências do Sistema** → **Acessibilidade** → **Conteúdo Falado**
2. Clique em **Gerenciar Vozes** e adicione vozes PT-BR

### Linux

```bash
sudo apt install espeak-ng
```

---

## 🛠️ Arquitetura (para curiosos)

```
dublador-e-tradutor-cc/
└── extension/
    ├── manifest.json     ← Manifest V3, permissões mínimas
    ├── content.js        ← TextTrack API + MutationObserver + buffer de chunks + pipeline
    ├── background.js     ← Service worker: executa chrome.tts (velocidade 2× hardcoded)
    ├── popup.html        ← Interface do popup
    ├── popup.js          ← Gravador de config
    ├── styles.css        ← Dark theme
    └── icons/            ← Ícones 16/48/128px
```

### Fluxo de dados

```
[Oracle MyLearn — Brightcove Player]
        │
        └── bootObservers() detecta <video> dinamicamente
              └── attachVideo() → attachTrack()
                    └── cuechange → pipeline() → bufferChunk(350ms)
                          └── pipelineFinal()
                                ├── resolveLang()
                                ├── translateToPT() se necessário → Google Translate (com cache)
                                └── enqueue() → drainQueue()
                                      └── sendMessage({ type: "SPEAK" })
                                            ↓
                                    [background.js — Service Worker]
                                            └── chrome.tts.speak({ rate: 2.0 })
                                                  └── TTS_DONE → drainQueue()
```

---

## 🛡️ Privacidade

- Os textos das legendas são enviados **apenas** para `translate.googleapis.com` (endpoint público do Google Tradutor, sem autenticação) — e somente quando o idioma não for Português
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
