// La contraseña de Supabase Auth: el mínimo lo fija el proyecto (8, en este caso) y el máximo
// lo fija bcrypt, midiendo en bytes UTF-8 por las tildes. crear-empleado/index.ts la vuelve a
// comprobar de verdad; esto es solo para no hacer un viaje de ida y vuelta con un error evidente.
export function isValidPassword(password: string): boolean {
  if (password === '') return true
  return password.length >= 8 && new TextEncoder().encode(password).length <= 72
}

export const PASSWORD_RULE = 'La contraseña debe tener entre 8 y 72 caracteres.'
