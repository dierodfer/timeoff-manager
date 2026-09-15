// El tope de 72 es de bcrypt, y cuenta bytes UTF-8, no caracteres.
export function isValidPassword(password: string): boolean {
  if (password === '') return true
  return password.length >= 8 && new TextEncoder().encode(password).length <= 72
}

export const PASSWORD_RULE = 'La contraseña debe tener entre 8 y 72 caracteres.'
