#!/bin/bash

#=================================================
# COMMON VARIABLES AND CUSTOM HELPERS
#=================================================

# The game is bundled with this package (sources/), no download needed.
numeria_deploy_sources() {
    # Replace the code but never touch $data_dir, where saves live
    ynh_safe_rm "$install_dir"
    mkdir -p "$install_dir"
    cp -a "$YNH_APP_BASEDIR/sources/." "$install_dir/"

    chmod -R o-rwx "$install_dir"
    chown -R "$app:$app" "$install_dir"
}

numeria_fix_data_permissions() {
    mkdir -p "$data_dir"
    chmod 750 "$data_dir"
    chmod -R o-rwx "$data_dir"
    chown -R "$app:$app" "$data_dir"
}

# Take a consistent copy of the SQLite database (safe while the app runs)
numeria_snapshot_db() {
    local db="$data_dir/numeria.db"
    if [ -f "$db" ]; then
        python3 - "$db" "$data_dir/numeria-backup.db" <<'PYEOF'
import sqlite3, sys
src = sqlite3.connect(sys.argv[1])
dst = sqlite3.connect(sys.argv[2])
with dst:
    src.backup(dst)
dst.close()
src.close()
PYEOF
        chown "$app:$app" "$data_dir/numeria-backup.db"
        chmod 640 "$data_dir/numeria-backup.db"
    fi
}
