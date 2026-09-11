#!/bin/zsh
set -e
ROOT="${0:A:h}"
APP="$HOME/Library/Application Support/HiggsfieldZH/AppleSpeechHost.app"
HOSTS="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
EXTENSION_ID="${1:-cankchigkakpidaaemffpjgpdnfkbmhj}"
mkdir -p "$APP/Contents/MacOS" "$HOSTS"
export CLANG_MODULE_CACHE_PATH="${TMPDIR:-/tmp}/higgsfield-clang-cache"
xcrun clang -O2 -fobjc-arc -fblocks -framework Foundation -framework Speech -framework AppKit "$ROOT/native/AppleSpeechHost.m" -o "$APP/Contents/MacOS/AppleSpeechHost"
cp "$ROOT/native/Info.plist" "$APP/Contents/Info.plist"
chmod 755 "$APP/Contents/MacOS/AppleSpeechHost"
cat > "$HOSTS/ai.higgsfield.zh.speech.json" <<JSON
{
  "name": "ai.higgsfield.zh.speech",
  "description": "Higgsfield Apple on-device English speech recognition",
  "path": "$APP/Contents/MacOS/AppleSpeechHost",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://$EXTENSION_ID/", "chrome-extension://daaeffklbochibhckgkmneklfcjngklm/"]
}
JSON
codesign --force --deep --sign - "$APP"
"$APP/Contents/MacOS/AppleSpeechHost" --authorize
echo "安装完成。请在弹出的窗口中允许语音识别，再重新加载 3.10.3 扩展。"
read -k 1 "?按任意键关闭…"
