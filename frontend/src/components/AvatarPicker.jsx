import { useCallback, useEffect, useRef, useState } from 'react';
import client, { getErrorMessage } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import AvatarImage from './AvatarImage';

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_SIZE = 2 * 1024 * 1024;

export default function AvatarPicker() {
  const { user, refreshUser } = useAuth();
  const [options, setOptions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [savingId, setSavingId] = useState(null);
  const [message, setMessage] = useState(null);
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef(null);

  const loadOptions = useCallback(async () => {
    const response = await client.get('/users/me/avatars');
    setOptions(response.data);
    return response.data;
  }, []);

  useEffect(() => {
    let active = true;

    loadOptions()
      .catch((err) => {
        if (active) setLoadError(getErrorMessage(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [loadOptions]);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return undefined;
    }

    const url = URL.createObjectURL(file);
    setPreviewUrl(url);

    return () => URL.revokeObjectURL(url);
  }, [file]);

  function clearFile() {
    setFile(null);
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  }

  function handleFileChange(event) {
    const selected = event.target.files?.[0];
    setMessage(null);

    if (!selected) {
      clearFile();
      return;
    }

    if (!ALLOWED_TYPES.includes(selected.type)) {
      setMessage({
        type: 'error',
        text: 'Solo se permiten imágenes PNG, JPG o WEBP',
      });
      clearFile();
      return;
    }

    if (selected.size > MAX_SIZE) {
      setMessage({
        type: 'error',
        text: 'La imagen no puede superar 2 MB',
      });
      clearFile();
      return;
    }

    setFile(selected);
  }

  async function handleSelect(avatarId) {
    if (!options || avatarId === options.currentAvatarId) {
      return;
    }

    const previousId = options.currentAvatarId;
    setOptions((current) => ({ ...current, currentAvatarId: avatarId }));
    setSavingId(avatarId);
    setMessage(null);

    try {
      await client.put('/users/me/avatar', { avatarId });
      await refreshUser();
      setMessage({ type: 'success', text: 'Avatar actualizado' });
    } catch (err) {
      setOptions((current) => ({
        ...current,
        currentAvatarId: previousId,
      }));
      setMessage({ type: 'error', text: getErrorMessage(err) });
    } finally {
      setSavingId(null);
    }
  }

  async function handleUpload() {
    if (!file) {
      return;
    }

    setUploading(true);
    setMessage(null);

    const formData = new FormData();
    formData.append('avatar', file);

    try {
      await client.post('/users/me/avatar/upload', formData);
      await refreshUser();
      await loadOptions();
      clearFile();
      setMessage({ type: 'success', text: 'Avatar actualizado' });
    } catch (err) {
      setMessage({ type: 'error', text: getErrorMessage(err) });
    } finally {
      setUploading(false);
    }
  }

  if (loading) {
    return (
      <p className="status" role="status">
        Cargando avatares…
      </p>
    );
  }

  if (loadError) {
    return (
      <p className="alert alert-error" role="alert">
        {loadError}
      </p>
    );
  }

  const busy = savingId !== null || uploading;

  return (
    <div className="avatar-picker">
      {message && (
        <p
          className={`alert ${
            message.type === 'error' ? 'alert-error' : 'alert-success'
          }`}
          role={message.type === 'error' ? 'alert' : 'status'}
        >
          {message.text}
        </p>
      )}

      <div className="avatar-picker-grid">
        {options.defaults.map((avatar, index) => {
          const current = avatar.id === options.currentAvatarId;

          return (
            <button
              key={avatar.id}
              type="button"
              className={`avatar-option${
                current ? ' avatar-option-current' : ''
              }`}
              aria-pressed={current}
              aria-label={`Seleccionar avatar ${index + 1}`}
              disabled={busy}
              onClick={() => handleSelect(avatar.id)}
            >
              <AvatarImage
                src={avatar.url}
                username={user?.username}
                size={72}
              />
              {current && (
                <span className="avatar-check" aria-hidden="true">
                  ✓
                </span>
              )}
            </button>
          );
        })}

        {options.uploaded && (
          <button
            type="button"
            className={`avatar-option${
              options.uploaded.id === options.currentAvatarId
                ? ' avatar-option-current'
                : ''
            }`}
            aria-pressed={options.uploaded.id === options.currentAvatarId}
            aria-label="Tu imagen"
            disabled={busy}
            onClick={() => handleSelect(options.uploaded.id)}
          >
            <AvatarImage
              src={options.uploaded.url}
              username={user?.username}
              size={72}
            />
            {options.uploaded.id === options.currentAvatarId && (
              <span className="avatar-check" aria-hidden="true">
                ✓
              </span>
            )}
          </button>
        )}
      </div>

      <section className="avatar-upload">
        <h3>Subir imagen desde tu equipo</h3>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={handleFileChange}
          disabled={uploading}
        />

        {previewUrl && (
          <div className="avatar-preview">
            <img src={previewUrl} alt="Vista previa del avatar" />
          </div>
        )}

        {file && (
          <div className="avatar-upload-actions">
            <button
              type="button"
              className="button"
              onClick={handleUpload}
              disabled={uploading}
            >
              {uploading ? 'Subiendo…' : 'Usar esta imagen'}
            </button>
            <button
              type="button"
              className="button button-small"
              onClick={clearFile}
              disabled={uploading}
            >
              Cancelar
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
