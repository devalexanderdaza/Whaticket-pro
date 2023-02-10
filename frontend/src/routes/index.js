import React from "react";
import { BrowserRouter, Switch } from "react-router-dom";
import { ToastContainer } from "react-toastify";
import { AuthProvider } from "../context/Auth/AuthContext";
import { WhatsAppsProvider } from "../context/WhatsApp/WhatsAppsContext";
import LoggedInLayout from "../layout";
import Connections from "../pages/Connections/";
import Contacts from "../pages/Contacts/";
import Dashboard from "../pages/Dashboard/";
import Login from "../pages/Login/";
import Queues from "../pages/Queues/";
import Companies from "../pages/Companies/"
import QuickAnswers from "../pages/QuickAnswers/";
import Schedules from "../pages/Schedules/";
import SendMassMessage from "../pages/SendMassMessage";
import SettingMessage from "../pages/SettingMessage";
import Settings from "../pages/Settings/";
import inter from "../pages/inter/";
import ShippingReport from "../pages/ShippingReport";
import Signup from "../pages/Signup/";
import Tags from "../pages/Tags/";
import Tickets from "../pages/Tickets/";
import Users from "../pages/Users";
import Route from "./Route";
import docs from "../pages/docs/";
import tokens from "../pages/tokens/";




const Routes = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Switch>
          <Route exact path="/login" component={Login} />
          <Route exact path="/signup" component={Signup} />
          <WhatsAppsProvider>
            <LoggedInLayout>
              <Route exact path="/" component={Dashboard} isPrivate />
              <Route
                exact
                path="/tickets/:ticketId?"
                component={Tickets}
                isPrivate
              />
              <Route
                exact
                path="/connections"
                component={Connections}
                isPrivate
              />
              <Route exact path="/contacts" component={Contacts} isPrivate />
              <Route exact path="/users" component={Users} isPrivate />
              <Route exact path="/quickAnswers" component={QuickAnswers} isPrivate />
              <Route exact path="/Settings" component={Settings} isPrivate />
              <Route exact path="/inter" component={inter} isPrivate />
              <Route exact path="/docs" component={docs} isPrivate />
              <Route exact path="/tokens" component={tokens} isPrivate />
              <Route exact path="/companies" component={Companies} isPrivate />
              <Route exact path="/Queues" component={Queues} isPrivate />
              <Route exact path="/tags" component={Tags} isPrivate />
              <Route exact path="/schedules" component={Schedules} isPrivate />
              <Route exact path="/BulkMessage" component={SendMassMessage} isPrivate />

              <Route exact path="/ShippingReport" component={ShippingReport} isPrivate />
              <Route exact path="/SettingsMessage" component={SettingMessage} isPrivate />
              
            </LoggedInLayout>
          </WhatsAppsProvider>
        </Switch>
        <ToastContainer autoClose={3000} />
      </AuthProvider>
    </BrowserRouter>
  );
};

export default Routes;
