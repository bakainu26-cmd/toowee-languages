# Panel nauczyciela

Pięć osobnych zakładek: Moi uczniowie, Grupy, Gry, Statystyki, Słownictwo. Widok jest dostępny dla kont teacher oraz ADMIN w trybie nauczyciela. Ukrywa nawigację i moduły nauki ucznia; przełączenie ADMIN na ucznia zachowuje poprzedni interfejs.

- Moi uczniowie: istniejąca lista i dodawanie profilu. Profil ma Foldery słów, Statystyki ucznia, Wygeneruj grę dla ucznia. Folder jest kontenerem zestawów; każdy zestaw to istniejący vocabulary_folders z własnymi słówkami. Edytor/import i gra korzystają z aktualnie otwartego zestawu. Materiały są rozdzielone według języka. Nowe profile nadal działają bez kont uczniów.
- Grupy: lista grup, tworzenie i edycja nazwy oraz składu grupy. Uczniów wybiera się z własnych profili, także bez konta. Zmiana grupy nie przenosi ani nie kopiuje materiałów.
- Gry: tworzenie Saszetek Sophie. Pozostają istniejące ustawienia i oba tryby tempa.
- Statystyki: liczby uczniów, grup, zestawów, słówek i zakończonych gier, przejście do ucznia i pełna dotychczasowa historia gier.
- Słownictwo: Klasy jako kontenery zestawów, Zestawy oraz pełna Baza słów. Nowy zestaw można utworzyć w klasie, istniejący zestaw ogólny przypisać do klasy. Zestaw ucznia pozostaje w jego profilu. Materiały można kopiować do profilu ucznia (maks. 500 słówek); oryginał i jego postęp nie zmieniają się.

Dotychczasowy jeden zestaw ucznia zostaje zachowany jako zestaw przechowujący słówka bez zestawu. Nie zmieniamy jego identyfikatora ani postępu. Zaproszenie do profilu kopiuje także nowe zestawy. Po połączeniu konta dodawane materiały synchronizują się istniejącym przypisaniem; zasady prywatności statystyk pozostają bez zmian.

## Konfiguracja
Przycisk Aktualizuj panel nauczyciela pobiera całość: accounts_setup.sql, multiplayer_setup.sql, statistics_setup.sql, teacher_setup.sql. Uruchom komplet w Supabase SQL Editor. Migracja jest powtarzalna, zachowuje uczniów, słówka, połączenia i wyniki. Nowe tabele grup i organizacji materiałów są prywatne; RPC sprawdza rolę oraz własność profili, grup, folderów i zestawów.

## Zakres gry z profilu ucznia

Kliknięcie Wygeneruj grę dla ucznia otwiera listę dostępnych gier. Obecnie jest tam karta Saszetki Sophie. Dopiero wybór tej karty otwiera konfigurację i wybór słownictwa, bez wymogu słówek w aktualnie otwartym zestawie. Pobieramy metadane folderów/zestawów tego profilu oraz słówka wyłącznie z tych zestawów, z filtrem właściciela i paginacją. W konfiguracji są trzy zakresy: całe słownictwo ucznia (w języku gry), wybrany folder (wszystkie jego zestawy), wybrany zestaw. Lista nie zawiera materiałów innych profili ani prywatnych zestawów nauczyciela. Gdy bieżący język ma pusty zestaw, ale uczeń ma słówka w innym języku, konfiguracja wybiera dostępny język ze słówkami. Pusta lub zbyt mała pula ma czytelny licznik i blokuje utworzenie gry (wymagane co najmniej cztery różne pytania/odpowiedzi). Zmiana zakresu usuwa nieaktualny szkic tworzenia pokoju. Poprawka działa z już zainstalowanym teacher_setup.sql i nie dodaje migracji.

## Nauczyciel jako własny uczeń

W Moi uczniowie przycisk „Dodaj mnie jako ucznia” tworzy jeden profil powiązany z bieżącym kontem, oznaczony (Ty). Ponowienie nie tworzy duplikatu; rola teacher/admin pozostaje bez zmian. Nie tworzymy połączenia teacher→self ani drugiego konta. Materiały dodawane w tym profilu zapisują się bezpośrednio jako własne słówka, bez kopiowania assignmentów. Statystyki własnej nauki obejmują własną bibliotekę z pominięciem materiałów przygotowanych w profilach innych uczniów. Przycisk dodawania znika, gdy profil już istnieje. Wymaga aktualnej konfiguracji kont/statystyk z przycisku Aktualizuj panel nauczyciela.

## Całe słownictwo ucznia
Domyślny widok „Całe słownictwo” jest wirtualną listą, a nie kopią danych. RPC profile_load z all=true łączy słówka nauczyciela z folderów i zestawów tego profilu oraz źródła dodatkowych materiałów przypisanych temu uczniowi przez tego nauczyciela. Nie obejmuje prywatnych materiałów nauczyciela, innych profili, cudzych nauczycieli ani innego języka. Własny profil nauczyciela obejmuje także jego własną bibliotekę z wyłączeniem materiałów przygotowanych dla innych uczniów. Konkretne zestawy pozostają osobno dostępne. Słówka i import dodawane z widoku zbiorczego trafiają do fizycznego zestawu bez zestawu i od razu są widoczne w całości. Nazwa dawnego systemowego folderu Ogólne wyświetla się jako Słówka bez zestawu; nie sugeruje już, że to cała biblioteka. Zmiana wymaga aktualizacji accounts_setup.sql przez przycisk Aktualizuj panel nauczyciela.


Panel zaczyna się od wyboru Japanese/English/Spanish lub widoków wszystkich uczniów, grup i słownictwa. Języki ucznia wynikają z jego folderów materiałów; nowy profil otwarty w wybranym języku tworzy własny pusty zestaw tego języka. Istniejącego ucznia można otworzyć z widoku wszystkich uczniów i wybrać kolejny język. Grupy zapisują lang; starsze grupy bez języka pozostają w widoku wszystkich grup do edycji. Globalna baza czyta wyłącznie własne vocabulary_words, stronicuje wyniki i pozwala wyszukiwać bez powielania danych. Uruchom najnowszy teacher_setup.sql przez aktualizację panelu.
