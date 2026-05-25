import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

type Props = { children: React.ReactNode; fallbackLabel?: string };
type State = { hasError: boolean; error: string | null };

/**
 * Error Boundary — captura crashes de JS no render tree
 * e exibe uma tela de fallback amigável em vez de fechar o app.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error: error?.message ?? 'Erro desconhecido' };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] crash:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.wrap}>
          <Text style={styles.emoji}>😕</Text>
          <Text style={styles.title}>{this.props.fallbackLabel ?? 'Algo deu errado'}</Text>
          <Text style={styles.detail} numberOfLines={3}>{this.state.error}</Text>
          <Pressable
            style={styles.btn}
            onPress={() => this.setState({ hasError: false, error: null })}
          >
            <Text style={styles.btnText}>Tentar novamente</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: '#08090c',
  },
  emoji: { fontSize: 48, marginBottom: 16 },
  title: { color: '#f0f0ef', fontSize: 18, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  detail: { color: 'rgba(240,240,239,0.4)', fontSize: 12, textAlign: 'center', marginBottom: 24, lineHeight: 18 },
  btn: {
    backgroundColor: '#7b2fff',
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
