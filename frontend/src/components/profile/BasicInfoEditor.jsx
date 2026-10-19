import { useEffect, useState } from 'react';
import { getErrorMessage, updateMyProfile } from '../../api/profile';
import { validateProfileInfo } from '../../validation/auth';

export default function BasicInfoEditor({ user, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    displayName: user.displayName || '',
    bio: user.bio || '',
  });
  const [errors, setErrors] = useState({});
  const [generalError, setGeneralError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm({
      displayName: user.displayName || '',
      bio: user.bio || '',
    });
  }, [user.displayName, user.bio]);

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((previous) => ({ ...previous, [name]: value }));
    setErrors((previous) => ({ ...previous, [name]: '' }));
    setGeneralError('');
  }

  function handleCancel() {
    setForm({
      displayName: user.displayName || '',
      bio: user.bio || '',
    });
    setErrors({});
    setGeneralError('');
    setEditing(false);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setGeneralError('');

    const localErrors = validateProfileInfo(form);
    if (Object.keys(localErrors).length > 0) {
      setErrors(localErrors);
      return;
    }

    setSaving(true);
    try {
      const profile = await updateMyProfile({
        displayName: form.displayName.trim(),
        bio: form.bio.trim(),
      });
      setEditing(false);
      onSaved(profile);
    } catch (err) {
      if (err.response?.status === 400 && err.response.data?.error?.fields) {
        setErrors(err.response.data.error.fields);
      }
      setGeneralError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <div className="basic-info-view">
        <p className="basic-info-bio">
          {user.bio || 'Todavía no agregaste una biografía.'}
        </p>
        <button
          type="button"
          className="button button-small"
          onClick={() => setEditing(true)}
        >
          Editar
        </button>
      </div>
    );
  }

  return (
    <form className="basic-info-editor" onSubmit={handleSubmit} noValidate>
      <div className="field">
        <label htmlFor="display-name">Nombre visible</label>
        <input
          id="display-name"
          name="displayName"
          type="text"
          value={form.displayName}
          onChange={handleChange}
          maxLength={40}
          aria-invalid={Boolean(errors.displayName)}
          aria-describedby={
            errors.displayName ? 'display-name-error' : 'display-name-help'
          }
        />
        {errors.displayName ? (
          <p className="field-error" id="display-name-error" role="alert">
            {errors.displayName}
          </p>
        ) : (
          <p className="field-help" id="display-name-help">
            {form.displayName.trim().length}/40 caracteres. Opcional; si lo
            dejas vacío se usa tu usuario.
          </p>
        )}
      </div>

      <div className="field">
        <label htmlFor="bio">Biografía</label>
        <textarea
          id="bio"
          name="bio"
          value={form.bio}
          onChange={handleChange}
          maxLength={200}
          rows={4}
          aria-invalid={Boolean(errors.bio)}
          aria-describedby={errors.bio ? 'bio-error' : 'bio-help'}
        />
        {errors.bio ? (
          <p className="field-error" id="bio-error" role="alert">
            {errors.bio}
          </p>
        ) : (
          <p className="field-help" id="bio-help">
            {form.bio.trim().length}/200 caracteres
          </p>
        )}
      </div>

      {generalError && (
        <p className="alert alert-error" role="alert">
          {generalError}
        </p>
      )}

      <div className="form-actions">
        <button type="submit" className="button" disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
        <button
          type="button"
          className="button button-secondary"
          onClick={handleCancel}
          disabled={saving}
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
