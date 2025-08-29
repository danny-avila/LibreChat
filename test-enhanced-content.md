# Test Enhanced Content Rendering

Oto przykłady różnych typów enhanced content, które możesz przetestować w LibreChat:

## 1. Multimedia (Obrazy)

```
Oto przykładowy obraz: https://fastly.picsum.photos/id/320/400/300.jpg?hmac=mmVaZ4JG1EuydVLwYNK0jSax0FIZ1QFEEgIvJwFbty8
```

## 2. Text-to-Speech

```
[tts:pl-PL]Witaj! To jest test funkcji synteza mowy w języku polskim.[/tts]
```

## 3. Wykresy

```
[chart:bar]
{
  "labels": ["Styczeń", "Luty", "Marzec", "Kwiecień"],
  "datasets": [{
    "label": "Sprzedaż",
    "data": [12, 19, 3, 17],
    "backgroundColor": "rgba(54, 162, 235, 0.2)",
    "borderColor": "rgba(54, 162, 235, 1)",
    "borderWidth": 1
  }]
}
[/chart]
```

## 4. Widget React

```
[widget:react]
function TestWidget() {
  const [count, setCount] = React.useState(0);
  return (
    <div style={{padding: '20px', border: '1px solid #ccc', borderRadius: '8px'}}>
      <h3>Licznik: {count}</h3>
      <button onClick={() => setCount(count + 1)}>Zwiększ</button>
      <button onClick={() => setCount(count - 1)}>Zmniejsz</button>
    </div>
  );
}
[/widget]
```

## 5. Kod do Uruchomienia

```
[run:python]
# Przykład kodu Python
def fibonacci(n):
    if n <= 1:
        return n
    return fibonacci(n-1) + fibonacci(n-2)

for i in range(10):
    print(f"F({i}) = {fibonacci(i)}")
[/run]
```

## 6. Kombinacja różnych elementów

```
Analiza danych sprzedażowych:

https://fastly.picsum.photos/id/320/400/300.jpg?hmac=mmVaZ4JG1EuydVLwYNK0jSax0FIZ1QFEEgIvJwFbty8

[chart:line]
{
  "labels": ["Q1", "Q2", "Q3", "Q4"],
  "datasets": [{
    "label": "Przychody 2024",
    "data": [100000, 150000, 120000, 180000],
    "borderColor": "rgb(75, 192, 192)",
    "tension": 0.1
  }]
}
[/chart]

[tts:pl-PL]Jak widać na wykresie, przychody w czwartym kwartale znacznie wzrosły.[/tts]
```

## Instrukcje testowania:

1. Skopiuj jeden z powyższych przykładów
2. Wklej go jako wiadomość w LibreChat
3. Wyślij wiadomość
4. Sprawdź czy enhanced content renderuje się poprawnie

## Oczekiwane rezultaty:

- **Obrazy**: Powinny wyświetlać się bezpośrednio w wiadomości
- **TTS**: Powinien pojawić się przycisk odtwarzania
- **Wykresy**: Powinien renderować się interaktywny wykres
- **Widgety**: Powinien działać interaktywny komponent React
- **Kod**: Powinien wyświetlać się z podświetlaniem składni

## Debugowanie:

Jeśli coś nie działa:

1. Otwórz DevTools (F12)
2. Sprawdź Console na błędy JavaScript
3. Sprawdź Network tab czy zasoby ładują się poprawnie
4. Sprawdź logi kontenera: `docker logs LibreChat --tail=50`