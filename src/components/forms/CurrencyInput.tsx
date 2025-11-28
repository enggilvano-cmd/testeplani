import { useState, useEffect, useCallback, InputHTMLAttributes } from 'react';
import { Input } from "@/components/ui/input";

const BRL_FORMATTER = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 });
interface CurrencyInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: number; // Valor em centavos
  onValueChange: (value: number) => void; // Retorna o valor em centavos
  allowNegative?: boolean; // Permite valores negativos
}

export function CurrencyInput({ value, onValueChange, allowNegative = false, ...props }: CurrencyInputProps) {
  const [displayValue, setDisplayValue] = useState(() => BRL_FORMATTER.format(value / 100));
  const [isNegative, setIsNegative] = useState(value < 0);

  useEffect(() => {
    // Sincroniza o valor exibido se o valor externo (prop) mudar.
    const absValue = Math.abs(value);
    const formattedValue = BRL_FORMATTER.format(absValue / 100);
    setDisplayValue(formattedValue);
    setIsNegative(value < 0);
  }, [value]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const { value: inputValue } = e.target;

    // Remove todos os caracteres não numéricos.
    const digitsOnly = inputValue.replace(/\D/g, '');

    // Remove zeros à esquerda para evitar problemas de conversão (ex: "0050" -> "50")
    const numericString = digitsOnly.replace(/^0+/, '');

    if (!numericString) {
      onValueChange(0);
      setDisplayValue('');
      return;
    }

    // Converte a string de dígitos para um número.
    const centsValue = parseInt(numericString, 10);
    onValueChange(isNegative ? -centsValue : centsValue);
  }, [onValueChange, isNegative, setDisplayValue]);

  const toggleSign = useCallback(() => {
    if (!allowNegative) return;
    const newIsNegative = !isNegative;
    setIsNegative(newIsNegative);
    const currentValue = Math.abs(value);
    onValueChange(newIsNegative ? -currentValue : currentValue);
  }, [allowNegative, isNegative, value, onValueChange]);

  return (
    <div className="relative">
      {allowNegative && (
        <button
          type="button"
          onClick={toggleSign}
          className="absolute left-2 top-1/2 -translate-y-1/2 text-sm font-medium px-2 py-1 rounded hover:bg-muted transition-colors z-10"
        >
          {isNegative ? '-' : '+'}
        </button>
      )}
      <Input
        {...props}
        type="tel"
        inputMode="numeric"
        value={displayValue}
        onChange={handleChange}
        onFocus={(e) => {
          e.target.select();
        }}
        placeholder="0,00"
        className={allowNegative ? 'pl-12' : ''}
      />
    </div>
  );
}