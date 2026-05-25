#!/bin/bash
# Hook executado pelo EAS antes do build iOS
# Força JSC desativando Hermes no Podfile

PODFILE="./ios/Podfile"

if [ -f "$PODFILE" ]; then
  echo "🔧 Forçando JSC no Podfile..."
  
  # Substitui :hermes_enabled => true por :hermes_enabled => false
  sed -i '' 's/:hermes_enabled => podfile_properties\["expo.jsEngine"\] == nil || podfile_properties\["expo.jsEngine"\] == .hermes./:hermes_enabled => false/g' "$PODFILE"
  
  # Também desativa via variável direta se o padrão acima não funcionar
  sed -i '' 's/:hermes_enabled => true/:hermes_enabled => false/g' "$PODFILE"
  
  echo "✅ Hermes desativado no Podfile"
  grep "hermes_enabled" "$PODFILE" | head -3
else
  echo "⚠️ Podfile não encontrado em $PODFILE"
fi
