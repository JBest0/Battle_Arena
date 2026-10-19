const { passwordRules, registerSchema } = require('../src/modules/auth/auth.schemas');

function resultObject(result) {
  const fields = {};
  if (!result.success) {
    for (const issue of result.error.issues) {
      const key = issue.path.join('.');
      if (fields[key] === undefined) {
        fields[key] = issue.message;
      }
    }
  }
  return fields;
}

describe('passwordRules', () => {
  it('acepta una contraseña válida', () => {
    expect(passwordRules.safeParse('Test1234').success).toBe(true);
  });

  it.each([
    ['sin letra', '12345678', 'La contraseña debe contener al menos una letra'],
    ['sin número', 'SoloLetras', 'La contraseña debe contener al menos un número'],
    [
      'con menos de 8 caracteres',
      'Ab1',
      'La contraseña debe tener al menos 8 caracteres',
    ],
  ])('rechaza una contraseña %s', (_case, value, message) => {
    const result = passwordRules.safeParse(value);

    expect(result.success).toBe(false);
    expect(result.error.issues[0].message).toBe(message);
  });

  it('rechaza una contraseña de más de 72 caracteres', () => {
    const result = passwordRules.safeParse(`${'a1'.repeat(37)}`);

    expect(result.success).toBe(false);
    expect(result.error.issues[0].message).toBe(
      'La contraseña debe tener como máximo 72 caracteres'
    );
  });

  it('marca la contraseña vacía como obligatoria', () => {
    expect(resultObject(passwordRules.safeParse(''))).toEqual({
      '': 'La contraseña es obligatoria',
    });
  });
});

describe('registerSchema', () => {
  const valid = {
    username: 'jugador_1',
    email: 'Jugador@Test.COM',
    password: 'Test1234',
    confirmPassword: 'Test1234',
  };

  it('normaliza username y email', () => {
    const result = registerSchema.safeParse(valid);

    expect(result.success).toBe(true);
    expect(result.data.username).toBe('jugador_1');
    expect(result.data.email).toBe('jugador@test.com');
  });

  it('exige los cuatro campos con mensajes en español', () => {
    const fields = resultObject(registerSchema.safeParse({}));

    expect(fields).toEqual(
      expect.objectContaining({
        username: 'El nombre de usuario es obligatorio',
        email: 'El correo es obligatorio',
        password: 'La contraseña es obligatoria',
        confirmPassword: 'Confirme la contraseña',
      })
    );
  });

  it('rechaza usernames con caracteres no permitidos', () => {
    const fields = resultObject(
      registerSchema.safeParse({ ...valid, username: 'con espacio' })
    );

    expect(fields.username).toBe(
      'El nombre de usuario solo puede contener letras, números y guion bajo'
    );
  });

  it('rechaza usernames fuera del rango de longitud', () => {
    expect(
      resultObject(registerSchema.safeParse({ ...valid, username: 'ab' }))
        .username
    ).toBe('El nombre de usuario debe tener al menos 3 caracteres');
    expect(
      resultObject(registerSchema.safeParse({ ...valid, username: 'a'.repeat(31) }))
        .username
    ).toBe('El nombre de usuario debe tener como máximo 30 caracteres');
  });

  it('rechaza correos mal formados', () => {
    const fields = resultObject(
      registerSchema.safeParse({ ...valid, email: 'no-es-correo' })
    );

    expect(fields.email).toBe('El formato del correo no es válido');
  });

  it('rechaza contraseñas distintas en confirmPassword', () => {
    const fields = resultObject(
      registerSchema.safeParse({ ...valid, confirmPassword: 'Otra1234' })
    );

    expect(fields.confirmPassword).toBe('Las contraseñas no coinciden');
  });
});
