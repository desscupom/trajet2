import { Platform } from 'react-native';

/**
 * Injeta CSS global no web (no-op no mobile).
 * Usado pra remover o outline amarelo do Chrome em pressables, e outras
 * customizações de scrollbar, focus, etc.
 */
export function GlobalWebStyles() {
  if (Platform.OS !== 'web') return null;

  const React = require('react');
  return React.createElement('style', {
    dangerouslySetInnerHTML: {
      __html: `
        /* Remove outline amarelo do Chrome em elementos focados via tap */
        *:focus {
          outline: none !important;
        }

        /* Mantém outline acessível só pra navegação por teclado */
        *:focus-visible {
          outline: 2px solid #14b8a6 !important;
          outline-offset: 2px;
          border-radius: 4px;
        }

        /* Inputs nativos (date, text) usam nosso teal no foco */
        input:focus,
        textarea:focus {
          outline: none !important;
        }

        /* Scrollbar mais discreta */
        ::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        ::-webkit-scrollbar-track {
          background: #0a0e1a;
        }
        ::-webkit-scrollbar-thumb {
          background: #2a3349;
          border-radius: 4px;
        }
        ::-webkit-scrollbar-thumb:hover {
          background: #3a4566;
        }

        /* Remove tap highlight do Safari/Chrome mobile */
        * {
          -webkit-tap-highlight-color: transparent;
        }

        /* Body background (caso tenha overscroll) */
        body {
          background: #0a0e1a;
        }
      `,
    },
  });
}
