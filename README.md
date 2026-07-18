<div align="center">

<br/>

<img src="https://img.shields.io/badge/📺-StreamTV-646cff?style=for-the-badge&labelColor=0d0d0f" height="60" alt="StreamTV Logo"/>

<br/><br/>

**Transforme seus VODs em uma emissora de TV 24/7.**

Organize, agende e transmita vídeos locais ou da Twitch/YouTube como um canal de televisão real — tudo do seu desktop.

<br/>

[![Electron](https://img.shields.io/badge/Electron-41.5-47848F?style=flat-square&logo=electron&logoColor=white)](https://electronjs.org)
[![React](https://img.shields.io/badge/React-19.2-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-8.0-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev)
[![License](https://img.shields.io/badge/License-BSD_3--Clause-green?style=flat-square)](LICENSE)
[![Open Source](https://img.shields.io/badge/Open_Source-💜-blueviolet?style=flat-square)](https://github.com/antojunimaia-ui/StreamTV)

</div>

---

## 📺 O que é o StreamTV?

O **StreamTV** é uma aplicação desktop open-source que permite a criadores de conteúdo operar um **canal de TV virtual ininterrupto**. Através de uma **Grade de Programação** visual (EPG), você distribui seus vídeos em horários específicos e o motor interno sincroniza a reprodução com o **relógio real do sistema** — garantindo que qualquer espectador veja exatamente o mesmo conteúdo no mesmo momento, como na TV tradicional.

```
┌─────────────────────────────────────────────────────────────┐
│  📺 StreamTV                                                │
│ ┌──────────┐ ┌───────────────────────────────────────────┐  │
│ │ 📚 Bibl. │ │  14:00  │  15:00  │  16:00  │  17:00    │  │
│ │ 📅 Grade │ │ ┌──────────────┐ ┌────────────────────┐  │  │
│ │ 🔴 Live  │ │ │  React #12   │ │  Gameplay GOW 4    │  │  │
│ │ ⚙️ Config│ │ └──────────────┘ └────────────────────┘  │  │
│ └──────────┘ │ ┌─────────┐ ┌──────────┐                 │  │
│              │ │  Memes  │ │ Tutorial │                  │  │
│              │ └─────────┘ └──────────┘                  │  │
│              └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## ✨ Funcionalidades

| Recurso | Descrição |
|---|---|
| **📺 Modo Transmissão** | Player fullscreen sincronizado com o relógio do sistema. Sai e volta? Ele recalcula o *offset* e retoma do segundo exato. |
| **📅 Grade de Programação** | Timeline horizontal estilo TV a cabo com blocos visuais posicionados por horário e duração real. |
| **🔄 Modo Playlist** | Escolha entre agendamento por horário fixo ou reprodução contínua (looping circular) dos vídeos da fileira atual. |
| **👁️ Preview WYSIWYG** | Visualize exatamente como os overlays de texto, relógio e ticker ficarão na transmissão diretamente no player da interface. |
| **📝 Título Dinâmico** | Altere o título da sua live diretamente do app e atualize automaticamente o título do seu broadcast no YouTube ao iniciar a transmissão. |
| **📁 Importação Local** | Selecione uma pasta e todos os `.mp4`, `.mkv`, `.webm`, `.avi`, `.mov` são listados automaticamente com duração real extraída. |
| **📂 Fileiras Temáticas** | Crie programas (ex: *Reacts*, *Gameplay*, *Séries*) como linhas separadas na grade, organizados por categoria. |
| **🔗 OAuth Nativo** | Vincule Twitch e YouTube via fluxo OAuth real — sem abrir browser externo. Tokens obtidos diretamente pelo Electron. |
| **📡 Streaming RTMP** | Transmita sua grade ao vivo via FFmpeg para YouTube, Twitch, Facebook ou qualquer servidor RTMP customizado. |
| **🎬 Auto-Switch** | Enquanto em stream, troca automaticamente entre o vídeo da grade e um screensaver animado quando não há conteúdo agendado. |
| **💾 Persistência Local** | Toda a grade, canais e configurações são salvas em JSON local — nenhum dado vai para a nuvem. |
| **🎨 Dark Mode Premium** | Interface ultra-dark, flat design, sem arredondamentos — foco total no conteúdo. |

---

## 🛠️ Stack Tecnológica

| Camada | Tecnologia | Papel |
|---|---|---|
| **UI** | React 19 + TypeScript 6 | Renderização reativa e tipagem estática |
| **Estilização** | CSS Vanilla (Dark Mode) | Design system sem dependências externas |
| **Desktop** | Electron 41 | Janela nativa, acesso a `fs`, OAuth via `BrowserWindow` |
| **Streaming** | FFmpeg (ffmpeg-static) | Encoding H.264/AAC e push RTMP |
| **Build** | Vite 8 | HMR instantâneo + bundling otimizado |
| **APIs** | Twitch Helix / YouTube Data v3 | Busca de VODs autenticada |

---

## 🚀 Quick Start

### Pré-requisitos

- [Node.js](https://nodejs.org/) **v18+**
- [npm](https://www.npmjs.com/) **v9+**

### Instalação

```bash
# 1. Clone o repositório
git clone https://github.com/antojunimaia-ui/StreamTV.git
cd StreamTV

# 2. Instale as dependências
npm install

# 3. Inicie em modo desenvolvimento (Vite + Electron em paralelo)
npm run app:dev
```

A janela do StreamTV abrirá automaticamente. Vá em **⚙️ Conexões** → **Selecionar Pasta** e aponte para um diretório com seus vídeos.

---

## ⚙️ Configuração de APIs (Opcional)

> **Nota:** A importação de **Pasta Local** funciona sem nenhuma configuração. As etapas abaixo são necessárias apenas se você quiser puxar VODs da Twitch ou YouTube.

A configuração é feita **diretamente pela interface**, sem editar código.

### Twitch

1. Acesse o [Twitch Developer Console](https://dev.twitch.tv/console) → **Criar App**
2. Copie o **Client ID**
3. No StreamTV → **⚙️ Conexões** → cole o Client ID e clique em **Salvar Chaves**

### YouTube

1. Acesse o [Google Cloud Console](https://console.cloud.google.com/)
2. Crie um projeto → **APIs e Serviços** → **Ativar** a **YouTube Data API v3**
3. Crie uma credencial **OAuth 2.0** → copie **Client ID** e **Client Secret**
4. Adicione `http://localhost:8080` como URI de redirecionamento autorizado
5. No StreamTV → cole ambos os campos e clique em **Salvar Chaves**

### RTMP (Streaming ao Vivo)

| Plataforma | URL do Servidor |
|---|---|
| **YouTube Live** | `rtmp://a.rtmp.youtube.com/live2` |
| **Twitch** | `rtmp://live.twitch.tv/app` |
| **Facebook Live** | `rtmp://live-api-s.facebook.com:443/rtmp/` |
| **Customizado** | Qualquer servidor compatível com RTMP |

Configure a **Stream Key** na aba **⚙️ Conexões** e inicie a transmissão no **🔴 Modo Transmissão**.

---

## 📂 Estrutura do Projeto

```
StreamTV/
├── electron/
│   ├── main.js            # Processo principal (IPC, OAuth, fs, FFmpeg/RTMP)
│   └── preload.cjs        # Bridge de segurança Electron
├── src/
│   ├── App.tsx            # Componente raiz (toda a lógica da aplicação)
│   ├── App.css            # Estilos da interface principal
│   ├── index.css          # Design tokens e reset global
│   └── services/
│       └── api.ts         # Integrações Twitch Helix & YouTube Data API v3
├── package.json
├── vite.config.ts
└── README.md
```

---

## 📋 Scripts Disponíveis

| Comando | Descrição |
|---|---|
| `npm run app:dev` | Inicia Vite + Electron em paralelo (desenvolvimento) |
| `npm run dev` | Inicia apenas o servidor Vite |
| `npm run build` | Compila TypeScript e gera o bundle de produção |
| `npm run lint` | Executa o ESLint no projeto |
| `npm run preview` | Pré-visualiza o build de produção |

---

## 🗺️ Roadmap

- [x] Motor de reprodução sincronizado com relógio real
- [x] Grade de Programação visual (EPG)
- [x] Múltiplas fileiras temáticas (Programas)
- [x] Importação de vídeos locais com detecção automática de duração
- [x] Autenticação OAuth nativa (Twitch + YouTube)
- [x] Player fullscreen com barra de progresso ao vivo
- [x] Configuração de credenciais pela interface (sem editar código)
- [x] Persistência da grade (salvar/carregar agendamentos em JSON local)
- [x] Exportação de stream via RTMP (YouTube/Twitch/Facebook/Custom)
- [x] Auto-switch entre vídeo e screensaver durante transmissão
- [x] Modo Playlist (loop de vídeo contínuo) além de grade fixa
- [x] Pré-visualização em tempo real (WYSIWYG) dos overlays de texto na interface
- [x] Atualização automática de metadados/título integrada ao YouTube Live
- [ ] Gestão de fillers (conteúdo para lacunas na grade)
- [ ] Sistema de notificações para troca de programa
- [ ] Geração de thumbnail automática via FFmpeg
- [ ] Timeline 24h contínua na grade

---

## 🤝 Contribuindo

Contribuições são muito bem-vindas! Este projeto é open-source e feito pela comunidade, para a comunidade.

1. **Fork** o repositório
2. Crie uma branch para sua feature: `git checkout -b feat/minha-feature`
3. Faça commit das mudanças: `git commit -m 'feat: adiciona minha feature'`
4. Faça push para a branch: `git push origin feat/minha-feature`
5. Abra um **Pull Request**

Siga o padrão [Conventional Commits](https://www.conventionalcommits.org/pt-br/) para as mensagens de commit.

---

## 📄 Licença

Este projeto está sob a licença **BSD-3-Clause**. Consulte o arquivo [LICENSE](LICENSE) para mais detalhes.

---

<div align="center">

Feito com 💜 para criadores de conteúdo que nunca dormem.<br/>
<strong>StreamTV</strong> — Sua emissora, suas regras.

<br/><br/>

⭐ Se este projeto te ajudou, considere deixar uma estrela no GitHub!

</div>
