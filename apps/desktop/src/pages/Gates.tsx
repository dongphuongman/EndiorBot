/**
 * Gates Page - SDLC gate status & approval
 */

export function GatesPage() {
  return (
    <div style={{ padding: '20px' }}>
      <h1 style={{ fontSize: '32px', marginBottom: '16px' }}>🚪 Gates</h1>
      <p style={{ color: '#9ca3af', marginBottom: '24px' }}>
        SDLC gate status and one-click approval (G0.1, G1, G2, G3, G4)
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
          SDLC gate management will be available in Sprint 50
        </p>
      </div>
    </div>
  );
}
