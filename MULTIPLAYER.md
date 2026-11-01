# Saszetki Sophie — quiz multiplayer

## Włącz grę

Wymagana wcześniejsza konfiguracja kont (`accounts_setup.sql`) i słownictwa. W Supabase SQL Editor uruchom `multiplayer_setup.sql` albo skopiuj go z: panel nauczyciela → Graj razem → Utwórz rozgrywkę → Włącz multiplayer — konfiguracja. Migracja jest idempotentna, nie kasuje rozgrywek ani nie zmienia istniejących tabel nauki i monet.

## Prowadzenie

1. Zaloguj się jako nauczyciel lub jako ADMIN w widoku nauczyciela.
2. Wybierz język, zestaw, kierunek pytań, liczbę rund (6/10/15/20/25) i czas (20/30/45/60 sekund).
3. Potrzeba przynajmniej 4 różnych pytań i odpowiedzi. Pula obejmuje do 1000 słówek z wybranego zestawu. Jeśli jest mniej słówek niż wybranych rund, gra używa dostępnej liczby.
4. Udostępnij kod albo link do pokoju. Uczniowie logują się na swoich kontach i dołączają z pseudonimem.
5. Poczekaj na uczestników i rozpocznij grę. Każdy ma własny ekran odpowiedzi i saszetek; prowadzący widzi ranking i steruje rundami.
6. Kolejna runda jest dostępna po rozliczeniu wszystkich odpowiedzi/saszetek lub po upływie czasu na pytanie + 10 sekund. Prowadzący może też zakończyć całą grę wcześniej.
7. Po ostatniej rundzie kliknij „Pokaż wyniki końcowe”. Uczeń kończy przyciskiem „Koniec gry — wróć do panelu”.

Japońskie słówka pokazują czytanie w nawiasach w pytaniach i odpowiedziach. Własne materiały nauczyciela są kopiowane do prywatnego banku pytań pokoju w chwili tworzenia — późniejsza edycja słówka nie zmienia trwającej gry.

## Punkty i zabezpieczenia

Poprawna odpowiedź daje 100 punktów, błędna 0. Po poprawnej odpowiedzi uczeń wybiera jedną z trzech saszetek z losowym bonusem 20, 40, 60, 80 lub 100 punktów. Bonusy są generowane i rozliczane w bazie. Ponowienie odpowiedzi, wyboru saszetki lub rozpoczęcia rundy nie nalicza punktów ani rund drugi raz.

Nie są to monety świata Sophie. Gra nie zmienia SRS, postępu fiszek ani portfela, ponieważ odpowiedź z wyborem i losowy bonus nie są końcową weryfikacją pamięci.

Odpowiedź poprawna i niewybrane bonusy nie są przesyłane uczniowi przed odpowiednim krokiem. Nauczyciel widzi tylko własny pokój. Tabele pokojów, odpowiedzi i uczestników nie są dostępne bezpośrednio dla użytkowników — funkcja RPC sprawdza rolę prowadzącego, członkostwo, czas, rundę i właściciela odpowiedzi. Dołączanie nie tworzy relacji nauczyciel–uczeń ani nie udostępnia prywatnej biblioteki gracza.

## Zapis, dołączanie i limity

Do 30 graczy w pokoju, do 3 otwartych pokojów nauczyciela, ważność pokoju 24 godziny. Po rozpoczęciu nie dołączają nowe osoby, ale wcześniej dołączony gracz może wrócić na tym samym koncie. Prowadzący może wrócić swoim kodem. Wyniki zachowują się po zamknięciu okna; przycisk „Wróć do ostatniego pokoju” korzysta z kodu zapamiętanego dla danego konta na urządzeniu. Kod/link umożliwia powrót również na innym urządzeniu. Po wygaśnięciu pokój nie jest już dostępny przez RPC.

Synchronizacja korzysta z odpytywania co 2,5 sekundy podczas otwartej gry. Ruch w tle nie wysyła zapytań; zakończona gra przestaje odpytywać. Przejściowe błędy nie zerują wyniku. Po błędzie zapisu odpowiedzi lub saszetki można bezpiecznie ponowić wybór. Zapytania i wyniki są chronione przed odpowiedziami z poprzedniej sesji/konta.

## Walidacja

Testy PostgreSQL (PGlite) obejmują rzeczywistą funkcję SQL: dwóch uczniów, role, prywatność banku pytań, ukrycie odpowiedzi, punkty i bonusy, duplikaty, przekroczony czas, sterowanie hosta, ponowną migrację oraz RLS. Testy DOM obejmują poczekalnię, dwa ekrany uczniów, klawiaturę 1–4 / 1–3, błędy połączenia, wznowienie, ranking, wynik końcowy i wylogowanie.

Konfiguracja produkcyjnej bazy i test na fizycznych urządzeniach wymagają uruchomienia migracji przez właścicielkę Supabase. Nie uruchomiono płatności ani mechanizmu abonamentów.
