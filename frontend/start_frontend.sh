#! /usr/bin/sh

port=8081
echo "Closing existing Expo instances on port ${port}..."
kill -9 $(netstat -tulnp 2>/dev/null | grep ${port} | awk '{print $7}' | cut -d'/' -f1)
echo $? "existing Expo instances closed."
echo "Starting Expo frontend..."

cd "$(dirname "$0")"

# http://localhost:8081/
npx expo start

cd -
