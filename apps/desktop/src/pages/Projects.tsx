/**
 * Projects Page - Multi-project switcher
 */

export function ProjectsPage() {
  return (
    <div style={{ padding: '20px' }}>
      <h1 style={{ fontSize: '32px', marginBottom: '16px' }}>📁 Projects</h1>
      <p style={{ color: '#9ca3af', marginBottom: '24px' }}>
        Switch between multiple projects (Bflow, NQH-Bot, MTEP)
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
          Multi-project management will be available in Sprint 50
        </p>
      </div>
    </div>
  );
}
