# Panel nauczyciela

Pięć osobnych zakładek: Moi uczniowie, Grupy, Gry, Statystyki, Słownictwo. Widok jest dostępny dla kont teacher oraz ADMIN w trybie nauczyciela. Ukrywa nawigację i moduły nauki ucznia; przełączenie ADMIN na ucznia zachowuje poprzedni interfejs.

- Moi uczniowie: istniejąca lista i dodawanie profilu. Profil ma Foldery słów, Statystyki ucznia, Wygeneruj grę dla ucznia. Folder jest kontenerem zestawów; każdy zestaw to istniejący vocabulary_folders z własnymi słówkami. Edytor/import i gra korzystają z aktualnie otwartego zestawu. Materiały są rozdzielone według języka. Nowe profile nadal działają bez kont uczniów.
- Grupy: lista grup, tworzenie i edycja nazwy oraz składu grupy. Uczniów wybiera się z własnych profili, także bez konta. Zmiana grupy nie przenosi ani nie kopiuje materiałów.
- Gry: tworzenie Saszetek Sophie. Pozostają istniejące ustawienia i oba tryby tempa.
- Statystyki: liczby uczniów, grup, zestawów, słówek i zakończonych gier, przejście do ucznia i pełna dotychczasowa historia gier.
- Słownictwo: Klasy jako kontenery zestawów, Zestawy oraz pełna Baza słów. Nowy zestaw można utworzyć w klasie, istniejący zestaw ogólny przypisać do klasy. Zestaw ucznia pozostaje w jego profilu. Materiały można kopiować do profilu ucznia (maks. 500 słówek); oryginał i jego postęp nie zmieniają się.

Dotychczasowy jeden zestaw ucznia zostaje zachowany jako zestaw w folderze Ogólne. Nie zmieniamy jego identyfikatora ani postępu. Zaproszenie do profilu kopiuje także nowe zestawy. Po połączeniu konta dodawane materiały synchronizują się istniejącym przypisaniem; zasady prywatności statystyk pozostają bez zmian.

## Konfiguracja
Przycisk Aktualizuj panel nauczyciela pobiera całość: accounts_setup.sql, multiplayer_setup.sql, statistics_setup.sql, teacher_setup.sql. Uruchom komplet w Supabase SQL Editor. Migracja jest powtarzalna, zachowuje uczniów, słówka, połączenia i wyniki. Nowe tabele grup i organizacji materiałów są prywatne; RPC sprawdza rolę oraz własność profili, grup, folderów i zestawów.
