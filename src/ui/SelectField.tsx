interface SelectFieldProps<T extends string> {
  readonly id: string
  readonly label: string
  readonly value: T
  readonly options: Record<T, string>
  readonly onChange: (value: T) => void
}

export function SelectField<T extends string>({
  id,
  label,
  value,
  options,
  onChange,
}: SelectFieldProps<T>) {
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        className="field"
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
      >
        {Object.entries<string>(options).map(([key, text]) => (
          <option key={key} value={key}>
            {text}
          </option>
        ))}
      </select>
    </div>
  )
}
