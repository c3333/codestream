import React, { useCallback, useState } from "react";
import cx from "classnames";
import { FormattedMessage } from "react-intl";
import Icon from "../Stream/Icon";
import Button from "../Stream/Button";
import { Link } from "../Stream/Link";
import {
	goToJoinTeam,
	goToNewUserEntry,
	goToEmailConfirmation,
	goToTeamCreation
} from "../store/context/actions";
import { TextInput } from "./TextInput";
import { LoginResult } from "@codestream/protocols/api";
import { RegisterUserRequestType } from "@codestream/protocols/agent";
import { HostApi } from "../webview-api";
import { completeSignup, startSSOSignin, SignupType } from "./actions";
import { logError } from "../logger";
import { useDispatch } from "react-redux";
import { CSText } from "../src/components/CSText";

const isPasswordValid = (password: string) => password.length >= 6;
export const isEmailValid = (email: string) => {
	const emailRegex = new RegExp(
		"^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$"
	);
	return email !== "" && emailRegex.test(email);
};
const isUsernameValid = (username: string) => new RegExp("^[-a-zA-Z0-9_.]{1,21}$").test(username);

const isNotEmpty = s => s.length > 0;

interface Props {
	email?: string;
	teamName?: string;
	teamId?: string;
	inviteCode?: string;
	type?: SignupType;
}

export const Signup = (props: Props) => {
	const dispatch = useDispatch();
	const [email, setEmail] = useState(props.email || "");
	const [emailValidity, setEmailValidity] = useState(true);
	const [username, setUsername] = useState("");
	const [usernameValidity, setUsernameValidity] = useState(true);
	const [password, setPassword] = useState("");
	const [passwordValidity, setPasswordValidity] = useState(true);
	const [fullName, setFullName] = useState("");
	const [fullNameValidity, setFullNameValidity] = useState(true);
	const [companyName, setCompanyName] = useState("");
	const [companyNameValidity, setCompanyNameValidity] = useState(true);
	const [isLoading, setIsLoading] = useState(false);
	const [unexpectedError, setUnexpectedError] = useState(false);
	const [inviteConflict, setInviteConflict] = useState(false);

	const wasInvited = props.inviteCode !== undefined;

	const onValidityChanged = useCallback((field: string, validity: boolean) => {
		switch (field) {
			case "email": {
				setEmailValidity(validity);
				break;
			}
			case "username":
				setUsernameValidity(validity);
				break;
			case "password":
				setPasswordValidity(validity);
				break;
			case "fullName":
				setFullNameValidity(validity);
				break;
			case "companyName":
				setCompanyNameValidity(validity);
				break;
			default: {
			}
		}
	}, []);

	const onSubmit = async (event: React.SyntheticEvent) => {
		setInviteConflict(false);
		setUnexpectedError(false);
		event.preventDefault();

		onValidityChanged("email", isEmailValid(email));
		onValidityChanged("password", isPasswordValid(password));
		onValidityChanged("username", isUsernameValid(username));
		onValidityChanged("fullName", isNotEmpty(fullName));
		onValidityChanged("companyName", isNotEmpty(companyName));

		if (
			email === "" ||
			!emailValidity ||
			!usernameValidity ||
			password === "" ||
			!passwordValidity ||
			fullName === "" ||
			!fullNameValidity ||
			(!wasInvited && (companyName === "" || !companyNameValidity))
		)
			return;
		setIsLoading(true);
		try {
			const attributes = {
				email,
				username,
				password,
				fullName,
				inviteCode: props.inviteCode,
				companyName: wasInvited ? undefined : companyName
			};
			const { status, token } = await HostApi.instance.send(RegisterUserRequestType, attributes);

			const sendTelemetry = () => {
				HostApi.instance.track("Account Created", {
					email: email,
					"Changed Invite Email?": wasInvited ? email !== props.email : undefined
				});
			};

			switch (status) {
				case LoginResult.Success: {
					sendTelemetry();
					dispatch(
						goToEmailConfirmation({
							email: attributes.email,
							teamId: props.teamId,
							registrationParams: attributes
						})
					);
					break;
				}
				case LoginResult.NotOnTeam: {
					sendTelemetry();
					dispatch(goToTeamCreation({ token, email: attributes.email }));
					break;
				}
				case LoginResult.AlreadyConfirmed: {
					// because user was invited
					sendTelemetry();
					dispatch(
						completeSignup(attributes.email, token!, props.teamId!, {
							createdTeam: false
						})
					);
					break;
				}
				case LoginResult.InviteConflict: {
					setInviteConflict(true);
					break;
				}
				default:
					throw status;
			}
		} catch (error) {
			logError(`Unexpected error during registration request: ${error}`, {
				email,
				inviteCode: props.inviteCode
			});
			setUnexpectedError(true);
		}
		setIsLoading(false);
	};

	const onClickGoBack = useCallback(
		(event: React.SyntheticEvent) => {
			event.preventDefault();
			switch (props.type) {
				case SignupType.JoinTeam: {
					return dispatch(goToJoinTeam());
				}
				case SignupType.CreateTeam:
				default:
					return dispatch(goToNewUserEntry());
			}
		},
		[props.type]
	);

	const onClickGithubSignup = useCallback(
		(event: React.SyntheticEvent) => {
			event.preventDefault();
			HostApi.instance.track("Provider Auth Selected", {
				Provider: "GitHub"
			});
			const info = props.inviteCode
				? { type: SignupType.JoinTeam, inviteCode: props.inviteCode }
				: undefined;
			return dispatch(startSSOSignin("github", info));
		},
		[props.type]
	);

	return (
		<div className="onboarding-page">
			<form className="standard-form" onSubmit={onSubmit}>
				<fieldset className="form-body">
					<div className="outline-box">
						<h2>Create an Account</h2>
						<div className="spacer" />
						{wasInvited && (
							<React.Fragment>
								<br />
								<p>
									Create an account to join the <strong>{props.teamName}</strong> team.
								</p>
							</React.Fragment>
						)}
						<div id="controls">
							<div className="small-spacer" />
							{unexpectedError && (
								<div className="error-message form-error">
									<FormattedMessage
										id="error.unexpected"
										defaultMessage="Something went wrong! Please try again, or "
									/>
									<FormattedMessage id="contactSupport" defaultMessage="contact support">
										{text => <Link href="https://help.codestream.com">{text}</Link>}
									</FormattedMessage>
									.
								</div>
							)}
							{inviteConflict && (
								<div className="error-message form-error">
									Invitation conflict.{" "}
									<FormattedMessage id="contactSupport" defaultMessage="Contact support">
										{text => <Link href="mailto:support@codestream.com">{text}</Link>}
									</FormattedMessage>
									.
								</div>
							)}
							<div className="control-group">
								<label>Work Email</label>
								<TextInput
									name="email"
									value={email}
									onChange={setEmail}
									onValidityChanged={onValidityChanged}
									validate={isEmailValid}
									required
								/>
								{!emailValidity && (
									<small className="explainer error-message">
										<FormattedMessage id="signUp.email.invalid" />
									</small>
								)}
							</div>
							<div className="control-group">
								<label>
									<FormattedMessage id="signUp.password.label" />
								</label>
								<TextInput
									type="password"
									name="password"
									value={password}
									onChange={setPassword}
									validate={isPasswordValid}
									onValidityChanged={onValidityChanged}
									required
								/>
								<small className={cx("explainer", { "error-message": !passwordValidity })}>
									<FormattedMessage id="signUp.password.help" />
								</small>
							</div>
							<div className="control-group">
								<label>
									<FormattedMessage id="signUp.username.label" />
								</label>
								<TextInput
									name="username"
									value={username}
									onChange={setUsername}
									onValidityChanged={onValidityChanged}
									validate={isUsernameValid}
								/>
								<small className={cx("explainer", { "error-message": !usernameValidity })}>
									<FormattedMessage id="signUp.username.help" />
								</small>
							</div>
							<div className="control-group">
								<label>
									<FormattedMessage id="signUp.fullName.label" />
								</label>
								<TextInput
									name="fullName"
									value={fullName}
									onChange={setFullName}
									required
									validate={isNotEmpty}
									onValidityChanged={onValidityChanged}
								/>
								{!fullNameValidity && <small className="explainer error-message">Required</small>}
							</div>
							{!wasInvited && (
								<div className="control-group">
									<label>
										<FormattedMessage id="signUp.companyName.label" />
									</label>
									<TextInput
										name="companyName"
										value={companyName}
										onChange={setCompanyName}
										required
										validate={isNotEmpty}
										onValidityChanged={onValidityChanged}
									/>
									{!companyNameValidity && (
										<small className="explainer error-message">Required</small>
									)}
								</div>
							)}

							<div className="small-spacer" />

							<Button className="row-button" onClick={onSubmit}>
								<Icon name="codestream" />
								<div className="copy">
									<FormattedMessage id="signUp.submitButton" />
								</div>
								<Icon name="chevron-right" />
							</Button>
						</div>
					</div>
				</fieldset>
			</form>
			<form className="standard-form">
				<fieldset className="form-body" style={{ paddingTop: 0 }}>
					<div id="controls">
						<div className="outline-box">
							<Button className="row-button no-top-margin" onClick={onClickGithubSignup}>
								<Icon name="mark-github" />
								<div className="copy">Sign Up with GitHub</div>
								<Icon name="chevron-right" />
							</Button>
							<div style={{ height: "15px" }} />
							<CSText muted as="span">
								If you use GitLab, BitBucket, or a self-managed git server, sign up with CodeStream
								above.
							</CSText>
						</div>
					</div>
				</fieldset>
			</form>
			<div style={{ textAlign: "center" }}>
				<small className="fine-print">
					<FormattedMessage id="signUp.legal.start" />{" "}
					<FormattedMessage id="signUp.legal.terms">
						{text => <Link href="https://codestream.com/terms">{text}</Link>}
					</FormattedMessage>{" "}
					<FormattedMessage id="and" />{" "}
					<FormattedMessage id="signUp.legal.privacyPolicy">
						{text => <Link href="https://codestream.com/privacy">{text}</Link>}
					</FormattedMessage>
				</small>
			</div>
			<div id="controls">
				<div className="footer">
					<Link onClick={onClickGoBack}>
						<p>{"< Back"}</p>
					</Link>
				</div>
			</div>
		</div>
	);
};
