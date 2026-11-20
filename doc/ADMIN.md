### Player accounts

Children do **not** need a YunoHost account. They create a game account (wizard name + password) directly in Numeria. Game accounts are stored in the app's own database, in `__DATA_DIR__/numeria.db`.

- To let anyone with the link play, give the `main` permission to **visitors** (default).
- To restrict the game to people with a YunoHost account, give the `main` permission to **all_users** or to a specific group.

Players can also play as a *guest*: their progress is then only stored in their browser.

### Teacher dashboard

The teacher dashboard is available at <https://__DOMAIN____PATH__/teacher/> (note: `__PATH__` might be `/`).

Access is controlled by the `teacher` permission (by default: the `admins` group). Add a group of teachers or parents in the YunoHost admin panel under *Users > Permissions* to give them access. From the dashboard you can:

- follow each player's level, accuracy and the skills they struggle with,
- set (and lock) a player's math grade, or let them choose,
- reset a forgotten password,
- delete a player,
- export everything as a CSV file.

### Backups

The YunoHost backup contains the whole database (all players and their progress). A consistent snapshot of the database is taken at backup time, so backups are safe while children are playing.

### Logs

The service is called `__APP__`. Its logs are in the YunoHost admin panel under *Services*, or with:

```bash
sudo journalctl -u __APP__
```
