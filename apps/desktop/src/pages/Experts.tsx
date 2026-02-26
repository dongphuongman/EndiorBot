/**
 * Experts Page - Multi-model consultation panel
 */

export function ExpertsPage() {
  return (
    <div style={{ padding: '20px' }}>
      <h1 style={{ fontSize: '32px', marginBottom: '16px' }}>🤖 Experts</h1>
      <p style={{ color: '#9ca3af', marginBottom: '24px' }}>
        Multi-model consultation (Claude, GPT, Gemini, Mistral) - see all expert opinions side-by-side
      </p>

      <div style={{
        padding: '40px',
        background: 'rgba(255, 255, 255, 0.05)',
        borderRadius: '12px',
        textAlign: 'center',
      }}>
        <p style={{ fontSize: '48px', marginBottom: '16px' }}>🚧</p>
        <h2 style={{ fontSize: '24px', marginBottom: '8px' }}>Coming Soon</h2>
        <p style={{ color: '#9ca3af' }}>
          Expert consultation panel will be available in Sprint 50
        </p>
      </div>
    </div>
  );
}
