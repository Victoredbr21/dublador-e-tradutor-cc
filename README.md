# 🎤 Fernando CC Reader

> Extensão para Google Chrome que lê em voz alta as legendas dos cursos **Oracle MyLearn** — tradução automática para PT-BR inclusa.

![Status](https://img.shields.io/badge/status-beta-yellow) ![Manifest](https://img.shields.io/badge/manifest-v3-blue) ![Licença](https://img.shields.io/badge/licen%C3%A7a-MIT-green)

---

## 📌 O que faz

O Oracle MyLearn usa um player SCORM (Articulate Storyline) com legendas no formato **WebVTT**. A extensão intercepta essas legendas diretamente pela **TextTrack API** do navegador, traduz os textos em inglês via Google Translate (sem chave de API) e narra tudo em português usando o motor de voz nativo do Chrome (`chrome.tts`).

### Funcionalidades

- ▶️ **Master Switch** — botão liga/desliga com memória de estado
- 🔊 **Seletor de voz** — Antonio, Francisca, Thalita e mais 10 vozes neurais PT-BR/PT-PT
- 🌎 **Seletor de idioma** — detectar automático ou fixar inglês, espanhol, francês, alemão etc.
- ⏩ **Controle de velocidade** — 0.5× a 2.0×
- 🔉 **Controle de volume** do narrador
- 📺 **Display de CC** — mostra a legenda original e a tradução em tempo real no popup
- 🛡️ **Tratamento de erros** completo (EX-1 a EX-4): sem lixo vermelho no console

---

## 🖥️ Requisitos

- Google Chrome **versão 109 ou superior** (Manifest V3)
- Windows, macOS ou Linux com vozes de síntese de voz instaladas
- Acesso ao [Oracle MyLearn](https://mylearn.oracle.com)

> **Vozes neurais:** o Chrome usa vozes instaladas no sistema operacional. No Windows, as vozes neurais PT-BR (Antonio, Francisca) já vêm por padrão no Windows 10/11. No macOS/Linux, veja a seção [Vozes](#-vozes) abaixo.

---

## ⚡ Instalação rápida (modo desenvolvedor)

### Passo 1 — Baixar o repositório

```bash
git clone https://github.com/Victoredbr21/dublador-e-tradutor-cc.git
cd dublador-e-tradutor-cc
```

Ou clique em **Code → Download ZIP** e extraia a pasta.

---

### Passo 2 — Abrir o gerenciador de extensões

1. Abra o Chrome
2. Na barra de endereço, digite:
   ```
   chrome://extensions
   ```
3. Pressione **Enter**

---

### Passo 3 — Ativar o modo desenvolvedor

No canto superior direito da página de extensões, ative o toggle **"Modo do desenvolvedor"**.

```
┌───────────────────────────────────────┐
│  Extensões       [Modo do desenvolvedor ●] │
└───────────────────────────────────────┘
```

---

### Passo 4 — Carregar a extensão

1. Clique em **"Carregar sem compactação"**
2. Navegue até a pasta que você clonou/extraiu
3. Selecione a pasta **`extension`** (não a raiz do projeto, a subpasta)
4. Clique em **"Selecionar pasta"**

A extensão aparecerá na lista com o nome **Fernando CC Reader**.

---

### Passo 5 — Fixar na barra do Chrome

1. Clique no ícone de peça de quebra-cabeça (🧩) na barra do Chrome
2. Encontre **Fernando CC Reader**
3. Clique no 📌 (fixar) ao lado do nome

O ícone do microfone aparecerá fixo na barra.

---

## 🎧 Como usar

### 1. Abrir um curso no Oracle MyLearn

Acesse [mylearn.oracle.com](https://mylearn.oracle.com), entre em qualquer curso com vídeo e inicie uma aula.

### 2. Ativar as legendas (CC) no player

O player precisa estar com as legendas **ligadas** para a TextTrack API funcionar. Procure o botão `CC` no canto do player e ative.

### 3. Ligar o narrador

Clique no ícone da extensão na barra e pressione o **botão redondo verde** (Master Switch).

```
┌──────────────────────────────┐
│ 🎤 Fernando CC Reader    [▶] │  ← botão vermelho = desligado
│ 🔴 Desativado               │
│                            │
│ Clique o botão acima ↑    │
└──────────────────────────────┘

┌──────────────────────────────┐
│ 🎤 Fernando CC Reader   [❘❘] │  ← botão verde = narrador ativo
│ 🟢 Aguardando legenda...    │
│                            │
│ Legenda detectada          │
│ "In this section we..."    │
│ Tradução PT-BR              │
│ "Nesta seção vamos..."     │
└──────────────────────────────┘
```

---

## ⚙️ Configurações

| Opção | Descrição | Padrão |
|-------|-----------|--------|
| **Voz** | Escolhe entre 13 vozes neurais PT-BR/PT-PT | Francisca |
| **Idioma da legenda** | Idioma fonte para tradução (ou detectar auto) | Detectar auto |
| **Velocidade** | Velocidade de narração de 0.5× a 2.0× | 1.1× |
| **Volume** | Volume do narrador de 0% a 100% | 100% |

> 💡 **Dica de velocidade:** fixar o idioma como "Inglês (en)" ao invés de "Detectar automático" elimina a detecção por regex e deixa a pipeline mais rápida.

---

## 🔊 Vozes

### Windows 10 / 11
As vozes **Antonio** e **Francisca** (neurais PT-BR) já estão disponíveis por padrão. Para verificar ou adicionar mais:

1. `Win + I` → **Hora e idioma** → **Fala**
2. Em "Vozes", clique em **Adicionar vozes**
3. Pesquise "Português (Brasil)" e instale

### macOS
1. **Preferências do Sistema** → **Acessibilidade** → **Conteúdo Falado**
2. Clique em **Gerenciar Vozes** e adicione vozes PT-BR

### Linux (Chrome)
Instale o pacote `espeak-ng` com suporte a `pt-BR`:
```bash
sudo apt install espeak-ng
```

---

## 🛡️ Privacidade

- **Nenhum dado é enviado para servidores externos**, exceto os textos das legendas para a API pública do Google Translate (`translate.googleapis.com`) — o mesmo endpoint que o Google Tradutor usa no navegador sem autenticação.
- A extensão **não tem service worker**, não monitora navegação e não acessa dados da conta Oracle.
- Toda configuração fica salva localmente no `chrome.storage.local`.

---

## 🛠️ Arquitetura

```
dublador-e-tradutor-cc/
└── extension/
    ├── manifest.json     ← Manifest V3, permissões mínimas
    ├── content.js        ← Intercepta TextTrack API + MutationObserver
    ├── popup.html        ← Interface do popup
    ├── popup.js          ← Gravador de config (zero sendMessage)
    ├── styles.css        ← Dark theme
    └── icons/            ← Ícones 16/32/48/128px
```

### Fluxo de dados

```
[Oracle MyLearn Player]
        │ TextTrack cuechange / MutationObserver
        ▼
  [content.js]
    1. Filtra texto de UI
    2. Detecta idioma (ou usa seletor fixo)
    3. Traduz via Google Translate (se EN)
    4. Fila FIFO → chrome.tts.speak()
    5. Grava lastOriginal / lastTranslated no storage
        │
        ▼ chrome.storage.onChanged
  [popup.js]
    Exibe legenda em tempo real
    Status: Aguardando / Narrando
```

---

## 🐛 Problemas conhecidos

| Sintoma | Causa provável | Solução |
|---------|---------------|----------|
| Nenhuma voz sai | Voz PT-BR não instalada no SO | Instalar voz conforme seção [Vozes](#-vozes) |
| Legenda não detectada | CC do player Oracle está desligado | Ativar o botão CC no player |
| Tradução falhou | Sem internet ou Google Translate bloqueado | Narrador fala o texto original como fallback |
| Console mostra `not-allowed` | Autoplay bloqueado — usuário ainda não interagiu | Clicar qualquer lugar na página |

---

## 📝 TODO (pós-testes)

- [ ] Testar no Oracle MyLearn com cursos OCI Foundations
- [ ] Verificar detecção de TextTrack dentro do iframe Storyline
- [ ] Empacotar como `.crx` para instalação sem modo dev
- [ ] Publicar na Chrome Web Store

---

## 📜 Licença

MIT — veja [LICENSE](LICENSE) para detalhes.

---

<sub>Feito com ☕ e muito Oracle por <a href="https://github.com/Victoredbr21">Victor Eduardo Meireles</a></sub>
