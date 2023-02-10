import React, { useState, useEffect } from "react";
import openSocket from "socket.io-client";
import { useHistory } from "react-router-dom";

import { makeStyles, withStyles } from "@material-ui/core/styles";
import Paper from "@material-ui/core/Paper";
import Typography from "@material-ui/core/Typography";
import Container from "@material-ui/core/Container";
import Select from "@material-ui/core/Select";
import TextField from "@material-ui/core/TextField";
import { toast } from "react-toastify";

import Tooltip from "@material-ui/core/Tooltip";

import api from "../../services/api";
import { i18n } from "../../translate/i18n.js";
import toastError from "../../errors/toastError";
import FormControlLabel from '@material-ui/core/FormControlLabel';
import Switch from '@material-ui/core/Switch';

const useStyles = makeStyles(theme => ({
	root: {
		backgroundColor: theme.palette.background.default,
		display: "flex",
		alignItems: "center",
		padding: theme.spacing(4),
	},

	paper: {
		padding: theme.spacing(2),
		display: "flex",
		alignItems: "center",
	},

	settingOption: {
		marginLeft: "auto",
	},
	margin: {
		margin: theme.spacing(1),
	},

}));

const IOSSwitch = withStyles((theme) => ({
	root: {
		width: 42,
		height: 26,
		padding: 0,
		margin: theme.spacing(1),
	},
	switchBase: {
		padding: 1,
		'&$checked': {
			transform: 'translateX(16px)',
			color: theme.palette.common.white,
			'& + $track': {
				backgroundColor: '#52d869',
				opacity: 1,
				border: 'none',
			},
		},
		'&$focusVisible $thumb': {
			color: '#52d869',
			border: '6px solid #fff',
		},
	},
	thumb: {
		width: 24,
		height: 24,
	},
	track: {
		borderRadius: 26 / 2,
		border: `1px solid ${theme.palette.grey[400]}`,
		backgroundColor: theme.palette.grey[50],
		opacity: 1,
		transition: theme.transitions.create(['background-color', 'border']),
	},
	checked: {},
	focusVisible: {},
}))
	(({ classes, ...props }) => {
		return (
			<Switch
				focusVisibleClassName={classes.focusVisible}
				disableRipple
				classes={{
					root: classes.root,
					switchBase: classes.switchBase,
					thumb: classes.thumb,
					track: classes.track,
					checked: classes.checked,
				}}
				{...props}
			/>
		);
	});

const Settings = () => {
	const classes = useStyles();
	const history = useHistory();

	const [settings, setSettings] = useState([]);

	useEffect(() => {
		const fetchSession = async () => {
			try {
				const { data } = await api.get("/settings");
				setSettings(data);
			} catch (err) {
				toastError(err);
			}
		};
		fetchSession();
	}, []);

	useEffect(() => {
		const socket = openSocket(process.env.REACT_APP_BACKEND_URL);

		socket.on("settings", data => {
			if (data.action === "update") {
				setSettings(prevState => {
					const aux = [...prevState];
					const settingIndex = aux.findIndex(s => s.key === data.setting.key);
					aux[settingIndex].value = data.setting.value;
					return aux;
				});
			}
		});

		return () => {
			socket.disconnect();
		};
	}, []);

	const handleChangeBooleanSetting = async e => {
		const selectedValue = e.target.checked ? "enabled" : "disabled";
		const settingKey = e.target.name;

		try {
			await api.put(`/settings/${settingKey}`, {
				value: selectedValue,
			});
			toast.success(i18n.t("settings.success"));
			history.go(0);
		} catch (err) {
			toastError(err);
		}
	};
	const handleChangeSetting = async e => {
		const selectedValue = e.target.value;
		const settingKey = e.target.name;

		try {
			await api.put(`/settings/${settingKey}`, {
				value: selectedValue,
			});
			toast.success(i18n.t("settings.success"));
		} catch (err) {
			toastError(err);
		}
	};

	const getSettingValue = key => {
		const { value } = settings.find(s => s.key === key);
		return value;
	};

	return (
		<div className={classes.root}>
			<Container className={classes.container} maxWidth="sm">
				<Typography variant="body2" gutterBottom>
					{i18n.t("settings.inter")}
				</Typography>

				<Typography variant="body2" gutterBottom></Typography>

		<Paper className={classes.paper1}><Typography align="center" variant="body1">IXC</Typography>
		<Paper elevation={4} className={classes.paper}>
		<TextField 
			style={{ marginRight: "1%", width: "50%" }}
				id="ipixc" 
				name="ipixc"
				margin="dense"
				label="IP do IXC" 
				variant="outlined" 
				value={settings && settings.length > 0 && getSettingValue("ipixc")}
				onChange={handleChangeSetting}
				fullWidth
			/>
			<TextField
			style={{ marginRight: "1%", width: "50%" }}
				id="tokenixc"
				name="tokenixc"
				label="Token IXC"
				margin="dense"
				variant="outlined"
				onChange={handleChangeSetting}
				fullWidth
				value={settings && settings.length > 0 && getSettingValue("tokenixc")}
			/>			
		</Paper>			
		</Paper>

		<Paper className={classes.paper1}><Typography align="center" variant="body1">ASAAS</Typography>
		<Paper elevation={4} className={classes.paper}>
			<TextField
			style={{ width: "100%" }}
				id="tokenasaas"
				name="tokenasaas"
				label="Token Asaas"
				margin="dense"
				variant="outlined"
				onChange={handleChangeSetting}
				fullWidth
				value={settings && settings.length > 0 && getSettingValue("tokenasaas")}
			/>			
		</Paper>			
		</Paper>
		<Paper className={classes.paper1}><Typography align="center" variant="body1">MK-AUTH</Typography>
		<Paper elevation={4} className={classes.paper}>
		<TextField 
			style={{ marginRight: "1%", width: "33%" }}
				id="ipmkauth" 
				name="ipmkauth"
				margin="dense"
				label="IP do MK-AUTH" 
				variant="outlined" 
				value={settings && settings.length > 0 && getSettingValue("ipmkauth")}
				onChange={handleChangeSetting}
				fullWidth
			/>
			<TextField
			style={{ marginRight: "1%", width: "32%" }}
				id="clientidmkauth"
				name="clientidmkauth"
				label="Cliente ID"
				margin="dense"
				variant="outlined"
				onChange={handleChangeSetting}
				fullWidth
				value={settings && settings.length > 0 && getSettingValue("clientidmkauth")}
			/>
			<TextField
			style={{ width: "33%" }}
				id="clientesecretmkauth"
				name="clientesecretmkauth"
				label="Cliente Secret"
				margin="dense"
				onChange={handleChangeSetting}
				variant="outlined"
				fullWidth
				value={settings && settings.length > 0 && getSettingValue("clientesecretmkauth")}
			/>			
		</Paper>			
		</Paper>		
			</Container>
		</div>
	);
};

export default Settings;
