import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { portalApi } from '../portalApi';

/**
 * Reached by typing the route — nothing anywhere links here. The gate is a
 * convenience, not a security boundary; see the note in routes/portal.ts.
 */
export function Login() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await portalApi.signIn(password);
      navigate('/portal');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={submit}>
        <span className="login-icon">
          <Icon name="lock" size={22} />
        </span>
        <h1>Back office</h1>
        <p>Controls for trials, jurors and evidence.</p>

        <div className="field">
          <label htmlFor="pw">Passphrase</label>
          <input
            id="pw"
            type="password"
            autoFocus
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && <div className="login-error">{error}</div>}

        <button type="submit" className="btn primary" disabled={busy || !password.trim()}>
          {busy ? 'Checking…' : 'Enter'}
        </button>
      </form>
    </div>
  );
}
