/**
 * useDismissKeyboard — fecha o teclado ao tocar fora de um input.
 * 
 * Uso: envolva o conteúdo com <TouchableWithoutFeedback onPress={dismiss}>
 * ou use o componente DismissKeyboard abaixo.
 */
import { Keyboard } from 'react-native';

export function useDismissKeyboard() {
  return () => Keyboard.dismiss();
}
