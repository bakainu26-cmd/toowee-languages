# Zestawy nauczycieli

Nowa zakładka **Zestawy** jest osobną biblioteką zadań. Nowe zestawy i kopie cudzych materiałów są prywatne. Autor może zaznaczyć „Udostępnij innym nauczycielom”; prywatne profile uczniów, grupy i przypisania nie są częścią publikacji.

## Konfiguracja

Po `accounts_setup.sql` i konfiguracji słownictwa uruchom `exercise-sets-setup.sql` w Supabase SQL Editor. Kod jest dostępny w zakładce Zestawy przez „Kopiuj konfigurację zestawów” oraz w zbiorczej aktualizacji panelu nauczyciela. Wymagane są wcześniejsze kolumny języka w słownictwie. Migracja jest powtarzalna i nie publikuje istniejących materiałów.

## Materiały

Każda karta przechowuje stabilny identyfikator, rodzaj, zadanie, odpowiedź, opcjonalne czytanie, trzy dodatkowe odpowiedzi i adres obrazka HTTPS. Dodatkowe odpowiedzi zapisują się z kartą w tym samym zestawie. Aktualizacje wymagają bieżącego numeru wersji, aby nie nadpisać zmian z innego okna. Kopiowanie publicznego zestawu tworzy niezależny, prywatny zestaw należący do kopiującego nauczyciela.

Import obejmuje pytanie–odpowiedź, słówko–tłumaczenie, quiz ABCD, pytania otwarte i japońskie słówko–czytanie–tłumaczenie. Dostępne są tabulatory oraz średniki; cudzysłowy pozwalają umieścić separator lub nowy wiersz wewnątrz pola. Najpierw sprawdzane są wszystkie wiersze, potem nauczyciel akceptuje podgląd. Żaden błędny wiersz nie jest po cichu pomijany. Limit wynosi 500 kart.

## Gry

- Plansza pytań: każdy rodzaj karty, odpowiedzi ocenia nauczyciel.
- Fiszki / wpisywanie: karty z jednoznaczną odpowiedzią, bez pytań otwartych.
- Quiz ABCD: każda karta musi mieć poprawną i trzy błędne odpowiedzi.
- Magic Dice: quiz z co najmniej dwoma różnymi zadaniami; zapisane odpowiedzi błędne są przekazywane do gry i linku dla ucznia.
- Saszetki, Kolekcje, Memory i pary: zestawy słówek z odpowiednią liczbą różnych par. Przy pierwszym uruchomieniu powstaje prywatny materiał zgodny ze starszymi grami. Kolejne gry używają tego samego materiału; po edycji synchronizowana jest jego nowa wersja.

Publiczne zestawy można ćwiczyć bez zmiany oryginału. Uruchomienie starszej gry wymagającej materiałów należących do nauczyciela jawnie oferuje zapis prywatnej kopii.

Nowe narzędzia do ćwiczeń i Plansza pytań działają w panelu nauczyciela; nie tworzą osobnych pokoi online. Zdalna gra Magic Dice i gry istniejące używają dotychczasowych mechanizmów swoich pokoi. Nie zapisujemy z nowych ćwiczeń punktów do waluty Sophie ani harmonogramu powtórek.
