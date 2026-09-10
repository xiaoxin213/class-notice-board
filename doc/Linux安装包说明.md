# Linux 安装包说明

> 适用于班级通知屏教室端 · Linux 版本

---

## 安装包格式

Linux 版使用 **AppImage** 格式，无需安装，下载后直接运行：

```bash
chmod +x 班级通知屏-v1.x.x-linux-x64.AppImage
./班级通知屏-v1.x.x-linux-x64.AppImage
```

---

## x64 安装包适用系统

文件名：`班级通知屏-vX.X.X-linux-x64.AppImage`

适用于搭载 **x86-64（Intel/AMD）** 处理器的设备，覆盖当前国内主流国产 PC 操作系统：

| 操作系统 | 常见版本 | 说明 |
|---|---|---|
| **统信 UOS** | UOS 专业版 / 家庭版（PC） | 基于 Debian，x86 平台主力版本 |
| **麒麟 V10** | 麒麟 V10 SP1 桌面版（x86） | 常见于政府、学校采购的联想、华硕等机型 |
| **中标麒麟** | NeoKylin V7 / V8 | 部分政务网配发机型 |
| **deepin** | deepin 23 | 面向个人用户，兼容性好 |
| **openKylin** | openKylin 1.0 / 2.0 | 开源麒麟社区版 |
| **Ubuntu / Debian（国产改版）** | 各发行版 | AppImage 对主流 glibc ≥ 2.28 系统均兼容 |

> **典型场景**：学校配发的联想、戴尔、HP 等 x86 一体机或台式机，以及普通 Intel/AMD 笔记本，均使用此包。

---

## arm64 安装包适用系统

文件名：`班级通知屏-vX.X.X-linux-arm64.AppImage`

适用于搭载 **ARM64（AArch64）** 处理器的设备，主要是国产 ARM 芯片平台：

| 处理器 / 平台 | 代表机型 | 操作系统 |
|---|---|---|
| **飞腾 FT-2000+/D2000** | 同方超翔、航天江南等整机 | 麒麟 V10 arm64 |
| **鲲鹏 920**（华为海思） | 华为泰山服务器 / 台式机 | 麒麟 V10 arm64、openEuler |
| **龙芯 3A6000**（LoongArch）| 龙芯派、各品牌整机 | ⚠️ **不兼容**，LoongArch 非 ARM64 |
| **申威 SW-64** | 申威工作站 | ⚠️ **不兼容**，独立 ISA |
| **树莓派 4/5** | — | 可运行，非国产系统场景 |

> **典型场景**：学校或政府通过"信创采购"配发的飞腾、鲲鹏一体机，操作系统通常为麒麟 V10 arm64 版。

---

## 关于语音播报

Linux 系统的语音播报依赖本地安装的 **speech-dispatcher** 和 **中文语音包**。

- 若系统已安装中文语音（如麒麟 V10 预装了 espeak-ng），通知将正常播报。
- 若无中文语音，应用将**静默展示通知**，并在全屏通知界面显示提示：
  > 🔇 当前设备无中文语音，已静默播报

如需启用语音，可在终端安装（以 Debian/Ubuntu 系为例）：

```bash
sudo apt install speech-dispatcher espeak-ng espeak-ng-data-cmn
```

安装后重启应用即可。

---

## 不支持的平台

| 平台 | 原因 |
|---|---|
| 龙芯 LoongArch | 独立指令集，Electron 尚无官方 LoongArch 构建 |
| 申威 SW-64 | 独立指令集，同上 |
| 32 位 x86（i386） | Electron 33 已放弃 32 位 Linux 支持 |

> 龙芯和申威平台如有需求，需等待 Electron 官方支持或采用 Web 方案替代。

---

## 版本对应

| 架构 | GitHub Actions Workflow | 构建 Runner |
|---|---|---|
| x64 | `build-linux-x64.yml` | `ubuntu-latest`（x86-64） |
| arm64 | `build-linux-arm64.yml` | `ubuntu-latest`（交叉编译，无需 ARM runner） |
