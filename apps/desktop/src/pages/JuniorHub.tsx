/**
 * Junior Hub Page - Junior dev task management
 */

export function JuniorHubPage() {
  return (
    <div style={{ padding: '20px' }}>
      <h1 style={{ fontSize: '32px', marginBottom: '16px' }}>👥 Junior Hub</h1>
      <p style={{ color: '#9ca3af', marginBottom: '24px' }}>
        Task assignment, code review, and on-job training for junior developers
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
          Junior dev management features will be available in Sprint 51
        </p>
      </div>
    </div>
  );
}
