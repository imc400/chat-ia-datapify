#!/usr/bin/env python3
"""
Script para actualizar el branding UI de Datapify
- Eliminar todos los emojis
- Unificar border-radius usando variables CSS
- Reemplazar iconos emoji por iconos SVG/texto
"""

import re
import os

# Mapeo de emojis a reemplazos textuales/SVG
EMOJI_REPLACEMENTS = {
    # Navegación
    '💬': '<svg class="icon" width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><path d="M2 5a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V5z"/></svg>',
    '📊': '<svg class="icon" width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z"/></svg>',
    '🏆': '<svg class="icon" width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><path d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z"/></svg>',
    '⚙️': '<svg class="icon" width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clip-rule="evenodd"/></svg>',

    # Acciones/Botones
    '📤': '',  # Eliminar, usar solo texto
    '🔄': '',
    '🔍': '<svg class="icon" width="16" height="16" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd"/></svg>',

    # Estados
    '✅': '✓',
    '❌': '✗',
    '⚠️': '!',
    '🔥': '',  # Hot leads - usar color rojo
    '🟡': '',  # Warm - usar color naranja
    '❄️': '',  # Cold - usar color gris

    # Stats
    '👥': '',
    '📈': '',
    '🎯': '',
    '💡': '',
    '🚀': '',
    '📋': '',
    '📞': '',
}

# Border radius mappings
BORDER_RADIUS_MAP = {
    '4px': 'var(--radius-sm)',
    '6px': 'var(--radius-sm)',
    '8px': 'var(--radius-md)',
    '10px': 'var(--radius-md)',
    '12px': 'var(--radius-md)',
    '16px': 'var(--radius-lg)',
    '20px': 'var(--radius-lg)',
}

def update_file(filepath, replacements):
    """Actualizar archivo con reemplazos"""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()

        original = content

        # Aplicar reemplazos
        for old, new in replacements.items():
            content = content.replace(old, new)

        if content != original:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(content)
            return True
        return False
    except Exception as e:
        print(f"Error updating {filepath}: {e}")
        return False

def update_border_radius(filepath):
    """Actualizar border-radius en CSS"""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()

        original = content

        # Reemplazar border-radius específicos con variables
        for old_value, new_value in BORDER_RADIUS_MAP.items():
            pattern = f'border-radius:\\s*{re.escape(old_value)}'
            replacement = f'border-radius: {new_value}'
            content = re.sub(pattern, replacement, content)

        if content != original:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(content)
            return True
        return False
    except Exception as e:
        print(f"Error updating border-radius in {filepath}: {e}")
        return False

def main():
    base_dir = '/Users/ignacioblanco/Desktop/Chat IA Datapify/public/dashboard'

    print("🎨 Actualizando branding UI de Datapify...")
    print()

    # 1. Actualizar emojis en HTML
    html_file = os.path.join(base_dir, 'index.html')
    if update_file(html_file, EMOJI_REPLACEMENTS):
        print(f"✓ Emojis eliminados de index.html")

    # 2. Actualizar emojis en JS
    js_file = os.path.join(base_dir, 'app.js')
    if update_file(js_file, EMOJI_REPLACEMENTS):
        print(f"✓ Emojis eliminados de app.js")

    # 3. Actualizar border-radius en CSS
    css_file = os.path.join(base_dir, 'styles.css')
    if update_border_radius(css_file):
        print(f"✓ Border-radius unificados en styles.css")

    print()
    print("✓ Actualización de branding completada!")
    print()
    print("Cambios aplicados:")
    print("  - Paleta de colores → #17B8A3 (turquesa)")
    print("  - Emojis → Eliminados/reemplazados por iconos SVG")
    print("  - Border-radius → Variables CSS consistentes")
    print("  - Tipografía → Inter, sans-serif")

if __name__ == '__main__':
    main()
