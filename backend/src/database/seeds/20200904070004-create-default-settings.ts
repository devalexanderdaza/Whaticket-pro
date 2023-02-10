import { QueryInterface } from "sequelize";

module.exports = {
  up: (queryInterface: QueryInterface) => {
    return queryInterface.bulkInsert(
      "Settings",
      [
        {
          key: "userCreation",
          value: "enabled",
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          key: "sideMenu",
          value: "disabled",
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          key: "darkMode",
          value: "disabled",
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          key: "closeTicketApi",
          value: "disabled",
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          key: "ipixc",
          value: "",
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          key: "tokenixc",
          value: "",
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          key: "tokenasaas",
          value: "",
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          key: "ipmkauth",
          value: "",
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          key: "clientidmkauth",
          value: "",
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          key: "clientesecretmkauth",
          value: "",
          createdAt: new Date(),
          updatedAt: new Date()
        }          
      ],
      {}
    );
  },

  down: (queryInterface: QueryInterface) => {
    return queryInterface.bulkDelete("Settings", {});
  }
};
