# Pathfinder 2nd Edition - Roll Manager

![Image 1](https://imgur.com/rNW0p5x.png)

![Image 2](https://imgur.com/umz79gi.png)

![Image 3](https://imgur.com/m1bKzdS.png)

![Image 4](https://imgur.com/4GOvB2g.png)


## Introduction

Welcome to the Pathfinder 2nd Edition - Roll Manager module for Foundry VTT! This module is designed to streamline the
process of prompting players for skill or saving rolls during your Pathfinder 2e sessions. Say goodbye to fumbling
through rulebooks or manually calculating rolls – with this module, you can effortlessly manage rolls and keep the game
flowing smoothly.

## Features

- **Easy Prompting**: GMs can quickly prompt players for skill or saving rolls via a user-friendly dialog box.
- **Custom Difficulty**: The GM can set the difficulty level for each roll, tailoring the challenge to fit the
  situation.
- **Seamless Integration**: The module seamlessly integrates into the Foundry VTT interface, enhancing your gameplay
  experience.
- **Flexibility**: GMs can select any number of skills or saving throws for players to roll, ensuring versatility in
  gameplay.
- **Flat Checks**: Support for flat checks is included, making it easy to handle special situations.
- **Roll Summary**: After the roll, the module provides a summary of the outcome to the GM in a private message, keeping
  important information easily accessible.
- **Inline DC Checks**: In journals skill check boxes will have a green button added which automatically sets up the skill roll.

## Installation

To install the Pathfinder 2nd Edition - Roll Manager module, simply follow these steps:

1. Download the module from the releases tab - you can use the JSON file to get Foundry to download the module.
2. Unzip the downloaded file.
3. Copy the folder named "pf2e-roll-manager" into the "modules" folder of your Foundry VTT installation.
4. Launch Foundry VTT and activate the module in your Game Settings.

## Usage

Once the module is activated, using the Roll Manager is a breeze:

1. As the GM, open the Roll Manager dialog box.
2. Select the desired difficulty level for the roll.
3. Choose the skills or saving throws you want players to roll.
4. Click "Roll" and watch as the module prompts players to make their rolls.
5. After the roll, receive a convenient summary of the outcome in a private message.

## Development

### Prerequisites

In order to build this module, recent versions of `node` and `npm` are
required. Most likely, using `yarn` also works, but only `npm` is officially
supported. We recommend using the latest lts version of `node`. If you use `nvm`
to manage your `node` versions, you can simply run

```
nvm install
```

in the project's root directory.

You also need to install the project's dependencies. To do so, run

```
npm install
```

### Building

You can build the project by running

```
npm run build
```

Alternatively, you can run

```
npm run build:watch
```

to watch for changes and automatically build as necessary.

### Linking the built project to Foundry VTT

In order to provide a fluent development experience, it is recommended to link
the built module to your local Foundry VTT installation's data folder. In
order to do so, first add a file called `foundryconfig.json` to the project root
with the following content:

```
{
  "dataPath": ["/absolute/path/to/your/FoundryVTT"]
}
```

(if you are using Windows, make sure to use `\` as a path separator instead of
`/`)

Then run

```
npm run link-project
```

On Windows, creating symlinks requires administrator privileges, so
unfortunately you need to run the above command in an administrator terminal for
it to work.

You can also link to multiple data folders by specifying multiple paths in the
`dataPath` array.

### Running the tests

You can run the tests with the following command:

```
npm test
```

### Creating a release

The workflow works basically the same as the workflow of the [League Basic JS Module Template], please follow the
instructions given there.
