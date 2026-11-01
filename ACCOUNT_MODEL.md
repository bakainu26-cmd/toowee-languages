# Konta, uczniowie i materiały TooWee

Rejestracja ma wybór Uczeń / Nauczyciel. Konta uczniów są niezależne. Istniejący uczeń może włączyć panel nauczyciela bez utraty biblioteki i postępu.

## Uruchomienie

Po wcześniejszej konfiguracji słownictwa, języków folderów i powtórek uruchom `accounts_setup.sql` w Supabase SQL Editor. Kod jest również pod przyciskiem „Skopiuj konfigurację kont” po zalogowaniu. Migracja jest powtarzalna i nie usuwa danych. Świat korzysta z istniejącej konfiguracji `world_setup.sql`.

1. Nauczyciel tworzy jednorazowy kod zaproszenia ważny 7 dni.
2. Uczeń loguje się lub zakłada konto i świadomie akceptuje kod.
3. Nauczyciel wybiera ucznia, język i własny zestaw. Wysyła do 500 nowych słówek naraz. Kolejne przypisanie przesyła pozostałe, bez duplikowania poprzednich.
4. Na koncie ucznia powstaje osobny zestaw „Od: …”. To kopia z chwili przypisania; edycje oryginału nie synchronizują się automatycznie.
5. Po odświeżeniu biblioteki uczeń wybiera źródło: Wszystkie dostępne / Moje słówka / Od konkretnego nauczyciela.
6. Fiszki, gry, zadania i nowe misje świata korzystają z tego wyboru. Zapisana misja wraca do swojego poprzedniego zestawu; wybór innego źródła obowiązuje przy kolejnej nowej misji.
7. W świecie pozostają jeden portfel i kolekcja. Dotychczasowe serwerowe reguły nagród i ochrona przed ponownym rozliczeniem zdarzenia dotyczą także kopii od nauczyciela.

## Prywatność

Nauczyciel widzi etapy i liczbę powtórek tylko słówek przypisanych przez siebie. Nie uzyskuje bezpośredniego dostępu do prywatnej biblioteki ucznia, globalnego portfela, jego kolekcji ani materiałów innych nauczycieli. Rejestr powiązań i przypisań jest niedostępny bezpośrednio z przeglądarki; operacje weryfikuje funkcja po stronie bazy.

Uczeń lub nauczyciel może rozłączyć konta. Dostęp nauczyciela do raportu ustaje. Kopie materiałów i własny postęp pozostają u ucznia. Ten sam uczeń może być połączony z kilkoma lektorami.

## Subskrypcje — uzgodniony kierunek, jeszcze bez wdrożonego rozliczania

- Nauczyciel: płatna subskrypcja; liczba uczniów jako możliwa podstawa pakietów.
- Uczeń: bezpłatne demo oraz pełna wersja w subskrypcji.
- Materiały opłacającego dostęp nauczyciela mają umożliwiać naukę i misje bez dodatkowej opłaty ucznia.
- Własna subskrypcja ucznia ma rozszerzać samodzielną naukę.

Ceny, limity demo, operator płatności i reguły wygasania dostępu nie zostały ustalone. Ta wersja nie pobiera opłat i nie egzekwuje abonamentów. Rola nauczyciela nie jest potwierdzeniem płatności ani uprawnieniem administratora. „Graj razem” pozostaje przyszłą funkcją panelu nauczyciela; nie jest wdrożone w tej zmianie.

## ADMIN właścicielki

Nadanie roli ADMIN odbywa się wyłącznie prywatną operacją właścicielki w Supabase SQL Editor, dla jednego wskazanego konta. Publiczny interfejs nie udostępnia operacji nadawania ADMIN. Publiczna rejestracja i metadane użytkownika nie tworzą administratorów. Aktualizacja accounts_setup.sql dodaje obsługę roli bez nadawania jej komukolwiek.

ADMIN ma przełącznik widoku nauczyciela/ucznia z zapamiętywaniem wyboru na urządzeniu. To widoki tego samego konta, bez podszywania się pod innych uczniów. Zmiana widoku nie zmienia roli w bazie. Uprawnienia nauczycielskie nadal dotyczą tylko własnych połączeń i materiałów, nie globalnego podglądu prywatnych kont.
