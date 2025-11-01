#! /usr/bin/sh

port=8081
echo "Closing existing Expo instances on port ${port}..."
kill -9 $(netstat -tulnp 2>/dev/null | grep ${port} | awk '{print $7}' | cut -d'/' -f1)
echo $? "existing Expo instances closed."

# If Expo is not installed locally, install it
if [ ! -x "./node_modules/.bin/expo" ]; then
  echo "🚀 Expo not found locally. Installing..."
  npm install --save-dev expo
else
  echo "✅ Expo is already installed locally."
fi

echo "Starting Expo frontend..."

cd "$(dirname "$0")"

# http://localhost:8081/
npx expo start

cd -
