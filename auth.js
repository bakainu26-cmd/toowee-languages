'use strict';
// Public browser credentials; authorization is enforced by Supabase RLS.
(() => {
  const url = 'https://bqduwzbcnfujuthefauu.supabase.co';
  const publicKey = 'sb_publishable_v2-BPzEhqIvEG2aYg877AA_mKlS4nxA';
  const el = id => document.getElementById(id);
  let client;
  let userId = null;
  let revision = 0;
  let busy = false;
  function status(message, kind = '') {
    el('authStatus').textContent = message;
    el('authStatus').className = 'account-status ' + kind;
  }
  function setBusy(value) {
    busy = value;
    document.querySelectorAll('#accountPanel button').forEach(button => button.disabled = value);
  }
  function message(error) {
    const known = {
      invalid_credentials: 'Nieprawidłowy e-mail lub hasło.',
      email_not_confirmed: 'Potwierdź adres e-mail, klikając link w wiadomości od Supabase.',
      user_already_exists: 'Konto już istnieje. Spróbuj się zalogować.',
      weak_password: 'Hasło nie spełnia wymagań. Wybierz silniejsze hasło.',
      over_email_send_rate_limit: 'Limit wiadomości został osiągnięty. Spróbuj ponownie później.',
      signup_disabled: 'Rejestracja jest wyłączona w ustawieniach projektu.',
      unexpected_failure: 'Nie udało się utworzyć konta. Sprawdź ustawienia bazy w Supabase.'
    };
    return known[error.code] || ('Nie udało się wykonać operacji. ' + (error.message || 'Sprawdź połączenie i spróbuj ponownie.'));
  }
  async function loadProfile(id, version) {
    el('profileStatus').textContent = 'Ładowanie profilu…';
    try {
      const { data, error } = await client.from('profiles')
        .select('display_name,role,native_language,target_language').eq('id', id).maybeSingle();
      if (version !== revision || userId !== id) return;
      if (error) throw error;
      if (!data) {
        el('profileStatus').textContent = 'Konto jest zalogowane, ale nie znaleziono profilu. Sprawdź konfigurację profili w Supabase.';
        return;
      }
      const role = data.role === 'teacher' ? 'Nauczyciel' : data.role === 'student' ? 'Uczeń' : data.role;
      el('profileStatus').textContent = [data.display_name, 'Rola: ' + role,
        'Język nauki: ' + data.target_language].filter(Boolean).join(' • ');
    } catch (error) {
      if (version === revision && userId === id)
        el('profileStatus').textContent = 'Nie udało się odczytać profilu. ' + message(error);
    }
  }
  function renderSession(session) {
    const id = session?.user?.id || null;
    const changed = id !== userId;
    userId = id;
    el('signedOut').hidden = Boolean(id);
    el('signedIn').hidden = !id;
    if (id) {
      el('accountIdentity').textContent = 'Zalogowano jako: ' + session.user.email;
      status('Jesteś zalogowana / zalogowany.', 'success');
      if (changed || !el('profileStatus').textContent) {
        const version = ++revision;
        // Keep database requests outside the auth callback and its session lock.
        setTimeout(() => { if (version === revision) void loadProfile(id, version); }, 0);
      }
    } else {
      ++revision;
      el('accountIdentity').textContent = '';
      el('profileStatus').textContent = '';
      el('loginPassword').value = '';
      el('signupPassword').value = '';
      status('Zaloguj się lub utwórz konto.');
    }
  }
  el('loginForm').addEventListener('submit', async event => {
    event.preventDefault();
    if (!client || busy) return;
    setBusy(true);
    status('Logowanie…');
    try {
      const { data, error } = await client.auth.signInWithPassword({
        email: el('loginEmail').value.trim(), password: el('loginPassword').value
      });
      if (error) throw error;
      el('loginPassword').value = '';
      renderSession(data.session);
    } catch (error) { status(message(error), 'error'); }
    finally { setBusy(false); }
  });
  el('signupForm').addEventListener('submit', async event => {
    event.preventDefault();
    if (!client || busy) return;
    const name = el('signupName').value.trim();
    if (!name) { status('Wpisz imię lub nazwę.', 'error'); return; }
    setBusy(true);
    status('Tworzenie konta…');
    try {
      const { data, error } = await client.auth.signUp({
        email: el('signupEmail').value.trim(), password: el('signupPassword').value,
        options: { data: { display_name: name }, emailRedirectTo: location.origin + location.pathname }
      });
      if (error) throw error;
      el('loginEmail').value = el('signupEmail').value.trim();
      el('signupPassword').value = '';
      if (data.session) renderSession(data.session);
      else status('Sprawdź skrzynkę e-mail (także spam). Jeśli adres kwalifikuje się do rejestracji, otrzymasz link potwierdzający. Jeśli masz już konto, zaloguj się.', 'success');
    } catch (error) { status(message(error), 'error'); }
    finally { setBusy(false); }
  });
  el('logoutButton').addEventListener('click', async () => {
    if (!client || busy) return;
    setBusy(true);
    try {
      const { error } = await client.auth.signOut();
      if (error) throw error;
      renderSession(null);
    } catch (error) { status(message(error), 'error'); }
    finally { setBusy(false); }
  });
  el('reloadProfile').addEventListener('click', () => {
    if (userId) void loadProfile(userId, ++revision);
  });
  try {
    if (!window.supabase) throw new Error('Nie udało się pobrać biblioteki logowania. Odśwież stronę lub sprawdź połączenie.');
    client = window.supabase.createClient(url, publicKey);
    client.auth.onAuthStateChange((_event, session) => renderSession(session));
    // INITIAL_SESSION restores the account after a reload, including email confirmation callbacks.
    setBusy(false);
  } catch (error) {
    setBusy(true);
    status(message(error), 'error');
  }
})();
