import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../../config';

const LoginPage = () => {
  const navigate = useNavigate();
  const [credentials, setCredentials] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleChange = (e) => {
    setCredentials({ ...credentials, [e.target.name]: e.target.value });
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      });
      const data = await response.json();
      if (data.success) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        navigate('/sales/crm');
      } else {
        setError(data.message || 'Login failed. Please check your credentials.');
      }
    } catch (err) {
      console.error(err);
      setError('Server error. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  };

  const styles = {
    page: {
      minHeight: '100vh',
      display: 'flex',
      fontFamily: "'Sora', 'Inter', sans-serif",
      background: '#f0f4ff',
      overflow: 'hidden',
      position: 'relative',
    },
    leftPanel: {
      flex: '1 1 55%',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      padding: '60px 40px',
      position: 'relative',
      overflow: 'hidden',
    },
    leftBg: {
      position: 'absolute',
      inset: 0,
      background: 'linear-gradient(135deg, #eef2ff 0%, #e0e7ff 50%, #ede9fe 100%)',
      zIndex: 0,
    },
    gridOverlay: {
      position: 'absolute',
      inset: 0,
      backgroundImage: `
        linear-gradient(rgba(99, 102, 241, 0.08) 1px, transparent 1px),
        linear-gradient(90deg, rgba(99, 102, 241, 0.08) 1px, transparent 1px)
      `,
      backgroundSize: '40px 40px',
      zIndex: 1,
    },
    glowOrb1: {
      position: 'absolute',
      width: '500px',
      height: '500px',
      borderRadius: '50%',
      background: 'radial-gradient(circle, rgba(99, 102, 241, 0.2) 0%, transparent 70%)',
      top: '-100px',
      left: '-150px',
      zIndex: 1,
    },
    glowOrb2: {
      position: 'absolute',
      width: '400px',
      height: '400px',
      borderRadius: '50%',
      background: 'radial-gradient(circle, rgba(16, 185, 129, 0.15) 0%, transparent 70%)',
      bottom: '-80px',
      right: '-80px',
      zIndex: 1,
    },
    brandContent: {
      position: 'relative',
      zIndex: 2,
      textAlign: 'center',
      maxWidth: '460px',
    },
    logoMark: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '64px',
      height: '64px',
      borderRadius: '18px',
      background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
      marginBottom: '32px',
      boxShadow: '0 8px 32px rgba(99, 102, 241, 0.35)',
    },
    logoIcon: {
      fontSize: '30px',
    },
    tagline: {
      fontSize: '13px',
      letterSpacing: '3px',
      textTransform: 'uppercase',
      color: '#4f46e5',
      fontWeight: '700',
      marginBottom: '16px',
    },
    headline: {
      fontSize: 'clamp(28px, 3vw, 42px)',
      fontWeight: '800',
      color: '#1e1b4b',
      lineHeight: '1.2',
      marginBottom: '20px',
    },
    headlineAccent: {
      background: 'linear-gradient(90deg, #6366f1, #10b981)',
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
      backgroundClip: 'text',
    },
    subtext: {
      fontSize: '16px',
      color: '#6b7280',
      lineHeight: '1.7',
      marginBottom: '48px',
    },
    statsRow: {
      display: 'flex',
      gap: '32px',
      justifyContent: 'center',
    },
    stat: {
      textAlign: 'center',
    },
    statNum: {
      fontSize: '22px',
      fontWeight: '700',
      color: '#1e1b4b',
      display: 'block',
    },
    statLabel: {
      fontSize: '12px',
      color: '#9ca3af',
      letterSpacing: '0.5px',
      textTransform: 'uppercase',
    },
    statDivider: {
      width: '1px',
      background: '#c7d2fe',
      alignSelf: 'stretch',
    },
    rightPanel: {
      flex: '0 0 420px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 48px',
      background: '#ffffff',
      borderLeft: '1px solid #e0e7ff',
      boxShadow: '-4px 0 40px rgba(99, 102, 241, 0.07)',
      position: 'relative',
    },
    formWrap: {
      width: '100%',
      maxWidth: '340px',
      opacity: mounted ? 1 : 0,
      transform: mounted ? 'translateY(0)' : 'translateY(20px)',
      transition: 'opacity 0.5s ease, transform 0.5s ease',
    },
    formHeader: {
      marginBottom: '36px',
    },
    welcomeBack: {
      fontSize: '13px',
      color: '#10b981',
      fontWeight: '700',
      letterSpacing: '1.5px',
      textTransform: 'uppercase',
      marginBottom: '8px',
    },
    formTitle: {
      fontSize: '26px',
      fontWeight: '700',
      color: '#1e1b4b',
      margin: '0 0 8px 0',
    },
    formSubtitle: {
      fontSize: '14px',
      color: '#9ca3af',
      margin: 0,
    },
    errorBox: {
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      background: '#fef2f2',
      border: '1px solid #fecaca',
      borderRadius: '10px',
      padding: '12px 14px',
      marginBottom: '24px',
      color: '#dc2626',
      fontSize: '13px',
    },
    fieldGroup: {
      marginBottom: '20px',
    },
    label: {
      display: 'block',
      fontSize: '12px',
      fontWeight: '700',
      color: '#6b7280',
      letterSpacing: '0.5px',
      textTransform: 'uppercase',
      marginBottom: '8px',
    },
    inputWrap: {
      position: 'relative',
    },
    inputIcon: {
      position: 'absolute',
      left: '14px',
      top: '50%',
      transform: 'translateY(-50%)',
      fontSize: '16px',
      color: '#a5b4fc',
      pointerEvents: 'none',
    },
    input: {
      width: '100%',
      padding: '13px 14px 13px 42px',
      background: '#f8faff',
      border: '1.5px solid #e0e7ff',
      borderRadius: '10px',
      color: '#1e1b4b',
      fontSize: '14px',
      outline: 'none',
      boxSizing: 'border-box',
      transition: 'border-color 0.2s, box-shadow 0.2s',
      fontFamily: 'inherit',
    },
    eyeBtn: {
      position: 'absolute',
      right: '14px',
      top: '50%',
      transform: 'translateY(-50%)',
      background: 'none',
      border: 'none',
      color: '#a5b4fc',
      cursor: 'pointer',
      padding: '2px',
      fontSize: '16px',
      lineHeight: 1,
    },
    submitBtn: {
      width: '100%',
      padding: '14px',
      background: isLoading
        ? '#818cf8'
        : 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
      color: 'white',
      border: 'none',
      borderRadius: '10px',
      fontSize: '15px',
      fontWeight: '700',
      cursor: isLoading ? 'not-allowed' : 'pointer',
      marginTop: '28px',
      letterSpacing: '0.3px',
      transition: 'opacity 0.2s, transform 0.1s',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '8px',
      fontFamily: 'inherit',
      boxShadow: isLoading ? 'none' : '0 4px 20px rgba(99, 102, 241, 0.4)',
    },
    spinner: {
      width: '16px',
      height: '16px',
      border: '2px solid rgba(255,255,255,0.3)',
      borderTopColor: '#fff',
      borderRadius: '50%',
      animation: 'spin 0.7s linear infinite',
      flexShrink: 0,
    },
    divider: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      margin: '28px 0',
    },
    dividerLine: {
      flex: 1,
      height: '1px',
      background: '#e0e7ff',
    },
    dividerText: {
      color: '#c7d2fe',
      fontSize: '11px',
      letterSpacing: '0.5px',
    },
    footerNote: {
      textAlign: 'center',
      fontSize: '12px',
      color: '#c7d2fe',
      marginTop: '0',
    },
    secureIcon: {
      display: 'inline-block',
      marginRight: '4px',
    },
  };

  if (typeof document !== 'undefined' && !document.getElementById('login-keyframes')) {
    const style = document.createElement('style');
    style.id = 'login-keyframes';
    style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700;800&display=swap');
      @keyframes spin { to { transform: rotate(360deg); } }
      .login-input:focus { border-color: #6366f1 !important; box-shadow: 0 0 0 3px rgba(99,102,241,0.12) !important; background: #fff !important; }
      .login-input::placeholder { color: #c7d2fe; }
      .login-btn:hover:not(:disabled) { opacity: 0.9; transform: translateY(-1px); }
      .login-btn:active:not(:disabled) { transform: translateY(0); }
      @media (max-width: 768px) {
        .login-left { display: none !important; }
        .login-right { flex: 1 !important; padding: 40px 28px !important; border-left: none !important; box-shadow: none !important; background: #f0f4ff !important; }
        .login-right > div { background: #ffffff !important; border-radius: 20px !important; padding: 32px 24px !important; box-shadow: 0 4px 32px rgba(99,102,241,0.1) !important; }
        .login-mobile-logo { display: flex !important; }
      }
      @media (min-width: 769px) {
        .login-mobile-logo { display: none !important; }
      }
    `;
    document.head.appendChild(style);
  }

  return (
    <div style={styles.page}>
      {/* Left branding panel */}
      <div className="login-left" style={styles.leftPanel}>
        <div style={styles.leftBg} />
        <div style={styles.gridOverlay} />
        <div style={styles.glowOrb1} />
        <div style={styles.glowOrb2} />

        <div style={styles.brandContent}>
          <div style={styles.logoMark}>
            <span style={styles.logoIcon}>🚗</span>
          </div>
          <div style={styles.tagline}>GlobalCarSales Platform</div>
          <h1 style={styles.headline}>
            Your Sales Pipeline,{' '}
            <span style={styles.headlineAccent}>Supercharged</span>
          </h1>
          <p style={styles.subtext}>
            Manage buyers, sellers, vendors and finances from one unified CRM inbox — built for modern automotive sales teams.
          </p>
          <div style={styles.statsRow}>
            <div style={styles.stat}>
              <span style={styles.statNum}>12k+</span>
              <span style={styles.statLabel}>Leads Tracked</span>
            </div>
            <div style={styles.statDivider} />
            <div style={styles.stat}>
              <span style={styles.statNum}>98%</span>
              <span style={styles.statLabel}>Uptime</span>
            </div>
            <div style={styles.statDivider} />
            <div style={styles.stat}>
              <span style={styles.statNum}>4.9★</span>
              <span style={styles.statLabel}>Rating</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right login panel */}
      <div className="login-right" style={styles.rightPanel}>
        <div style={styles.formWrap}>

          {/* Mobile-only logo */}
          <div className="login-mobile-logo" style={{ alignItems: 'center', gap: '10px', marginBottom: '32px' }}>
            <div style={{ ...styles.logoMark, width: '40px', height: '40px', borderRadius: '12px', marginBottom: 0 }}>
              <span style={{ fontSize: '20px' }}>🚗</span>
            </div>
            <span style={{ color: '#1e1b4b', fontWeight: '700', fontSize: '16px' }}>GlobalCarSales</span>
          </div>

          <div style={styles.formHeader}>
            <p style={styles.welcomeBack}>Welcome back</p>
            <h2 style={styles.formTitle}>Sign in to CRM</h2>
            <p style={styles.formSubtitle}>Enter your credentials to access the dashboard</p>
          </div>

          {error && (
            <div style={styles.errorBox}>
              <span>⚠</span>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin}>
            <div style={styles.fieldGroup}>
              <label style={styles.label}>Username or Email</label>
              <div style={styles.inputWrap}>
                <span style={styles.inputIcon}>👤</span>
                <input
                  className="login-input"
                  type="text"
                  name="username"
                  value={credentials.username}
                  onChange={handleChange}
                  required
                  placeholder="Enter your username"
                  style={styles.input}
                  autoComplete="username"
                />
              </div>
            </div>

            <div style={styles.fieldGroup}>
              <label style={styles.label}>Password</label>
              <div style={styles.inputWrap}>
                <span style={styles.inputIcon}>🔒</span>
                <input
                  className="login-input"
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  value={credentials.password}
                  onChange={handleChange}
                  required
                  placeholder="••••••••"
                  style={{ ...styles.input, paddingRight: '42px' }}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  style={styles.eyeBtn}
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? '🙈' : '👁'}
                </button>
              </div>
            </div>

            <button
              className="login-btn"
              type="submit"
              disabled={isLoading}
              style={styles.submitBtn}
            >
              {isLoading ? (
                <>
                  <span style={styles.spinner} />
                  Signing in...
                </>
              ) : (
                'Sign In →'
              )}
            </button>
          </form>

          <div style={styles.divider}>
            <div style={styles.dividerLine} />
            <span style={styles.dividerText}>secured access</span>
            <div style={styles.dividerLine} />
          </div>

          <p style={styles.footerNote}>
            <span style={styles.secureIcon}>🔐</span>
            256-bit encrypted · SOC 2 compliant
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;