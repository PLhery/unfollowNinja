# -- For workers only, this does not launch the API
FROM node:18

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package*.json ./
RUN npm ci

# Bundle app source
COPY src src
COPY *.json ./
COPY *.js ./
RUN npm run build

COPY tests tests
COPY locales locales
COPY .env .env

CMD [ "node", "./dist/workers.js" ]
