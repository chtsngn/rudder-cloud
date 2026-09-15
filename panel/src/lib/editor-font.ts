/**
 * Monaco (dosya editörü) için TEK font yığını — hem editör seçeneklerinde
 * (`fontFamily`, Monaco karakter genişliğini bununla ölçer) hem de
 * globals.css'teki `.monaco-editor *` kuralında (tema fontunun editöre
 * sızmaması için) aynı değer kullanılmalı; ikisi ayrışırsa imleç kayar.
 * JetBrains Mono paneldeki terminalle aynı kod fontu; yüklenmemişse
 * Monaco'nun kendi varsayılanları (Menlo/Monaco/Consolas) devreye girer.
 */
export const EDITOR_FONT_FAMILY =
  '"JetBrains Mono", Menlo, Monaco, Consolas, "Courier New", ui-monospace, monospace'

export const EDITOR_FONT_SIZE = 13
