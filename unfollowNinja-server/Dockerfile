# -- For workers only, this does not launch the API
FROM node:12

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package*.json ./
RUN npm ci

# Bundle app source
COPY . .
RUN npm run build

CMD [ "npm", "start" ]
