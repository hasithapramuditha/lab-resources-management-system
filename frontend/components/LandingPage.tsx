import React, { useState, useEffect } from 'react';
import { useApp } from '../App';
import { UserRole, Student, Lecturer } from '../types';
import api from '../api';

const LandingPage: React.FC = () => {
  const { login, registerStudent, lecturers } = useApp();
  const [activeForm, setActiveForm] = useState<'login' | 'register'>('login');
  const [userType, setUserType] = useState<UserRole.STUDENT | UserRole.LECTURER | UserRole.ADMIN>(UserRole.STUDENT);

  // Login state
  const [studentId, setStudentId] = useState('');
  const [lecturerName, setLecturerName] = useState('');
  const [adminUsername, setAdminUsername] = useState('');
  const [password, setPassword] = useState('');
  
  // Registration state
  const [regStudentId, setRegStudentId] = useState('');
  const [regName, setRegName] = useState('');
  const [regCourse, setRegCourse] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');

  const [error, setError] = useState('');

  const [publicLecturers, setPublicLecturers] = useState<{id: string, name: string}[]>([]);

  useEffect(() => {
    if (userType === UserRole.LECTURER && publicLecturers.length > 0 && !lecturerName) {
      setLecturerName(publicLecturers[0].name);
    }
    // Clear specific fields when userType changes to avoid carrying over irrelevant data
    if (userType === UserRole.STUDENT) {
        setLecturerName('');
        setAdminUsername('');
    } else if (userType === UserRole.LECTURER) {
        setStudentId('');
        setAdminUsername('');
    } else if (userType === UserRole.ADMIN) {
        setStudentId('');
        setLecturerName('');
    }
    setError(''); // Clear error on tab switch

    // Only fetch if not logged in
    if (!sessionStorage.getItem('jwtToken')) {
      api.get('/users/public-lecturers')
        .then(res => setPublicLecturers(res.data.lecturers))
        .catch(() => setPublicLecturers([]));
    }
  }, [userType, lecturers, lecturerName, publicLecturers]);


  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    let identifier = '';
    if (userType === UserRole.STUDENT) identifier = studentId;
    else if (userType === UserRole.LECTURER) identifier = lecturerName;
    else if (userType === UserRole.ADMIN) identifier = adminUsername;

    // Validation: For lecturer, ensure a name is selected if there are lecturers
    if ((userType === UserRole.LECTURER && publicLecturers.length > 0 && !lecturerName) || !identifier || !password) {
      setError('Please fill in all fields.');
      return;
    }
    const success = await login(identifier, password, userType);
    if (!success) {
      setError('Invalid credentials. Please try again.');
    }
    // On success, App.tsx will navigate to dashboard
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!regStudentId || !regName || !regCourse || !regPassword || !regConfirmPassword) {
      setError('Please fill all registration fields.');
      return;
    }
    if (regPassword !== regConfirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    const studentData = { studentId: regStudentId, name: regName, course: regCourse, password: regPassword };
    const newStudent = await registerStudent(studentData);
    if (newStudent) {
      alert('Registration successful! Please login.');
      setActiveForm('login');
      // Clear registration form
      setRegStudentId(''); setRegName(''); setRegCourse(''); setRegPassword(''); setRegConfirmPassword('');
    }
    // Error message is handled by registerStudent via alert for now
  };
  
  const commonInputClasses = "w-full px-4 py-2 border border-neutral-light rounded-md focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-shadow shadow-sm";
  const buttonClasses = "w-full py-2 px-4 rounded-md transition-colors font-semibold";
  const toggleButtonBase = "px-4 py-2 transition-colors flex-1 text-sm sm:text-base";


  return (
    <div className="min-h-[calc(100vh-120px)] flex flex-col items-center justify-center bg-gradient-to-br from-neutral-light to-blue-100 p-4 animate-fadeIn">
      <div className="w-full max-w-md bg-white p-6 sm:p-8 rounded-xl shadow-2xl">
        <h2 className="text-3xl font-bold text-center text-primary mb-2">Welcome!</h2>
        <p className="text-center text-neutral-DEFAULT mb-6">Please login or register to continue.</p>

        {activeForm === 'login' ? (
          <form onSubmit={handleLogin} className="space-y-6">
            <div className="flex justify-center mb-4 rounded-md overflow-hidden border border-gray-300">
                <button type="button" onClick={() => setUserType(UserRole.STUDENT)} className={`${toggleButtonBase} ${userType === UserRole.STUDENT ? 'bg-primary text-white' : 'bg-gray-100 text-neutral-dark hover:bg-blue-100'}`}>Student</button>
                <button type="button" onClick={() => setUserType(UserRole.LECTURER)} className={`${toggleButtonBase} ${userType === UserRole.LECTURER ? 'bg-primary text-white' : 'bg-gray-100 text-neutral-dark hover:bg-blue-100'} border-l border-r border-gray-300`}>Lecturer</button>
                <button type="button" onClick={() => setUserType(UserRole.ADMIN)} className={`${toggleButtonBase} ${userType === UserRole.ADMIN ? 'bg-primary text-white' : 'bg-gray-100 text-neutral-dark hover:bg-blue-100'}`}>Admin</button>
            </div>
            
            {userType === UserRole.STUDENT && (
              <div>
                <label htmlFor="studentId" className="block text-sm font-medium text-neutral-dark mb-1">Student ID</label>
                <input type="text" id="studentId" value={studentId} onChange={(e) => setStudentId(e.target.value)} className={commonInputClasses} placeholder="e.g., S12345" required />
              </div>
            )}
            {userType === UserRole.LECTURER && (
              <div>
                <label htmlFor="lecturerName" className="block text-sm font-medium text-neutral-dark mb-1">Lecturer Name</label>
                <select id="lecturerName" value={lecturerName} onChange={(e) => setLecturerName(e.target.value)} className={commonInputClasses} required>
                  {publicLecturers.length === 0 && <option value="">No lecturers registered</option>}
                  {publicLecturers.map(l => <option key={l.id} value={l.name}>{l.name}</option>)}
                </select>
              </div>
            )}
            {userType === UserRole.ADMIN && (
                 <div>
                    <label htmlFor="adminUsername" className="block text-sm font-medium text-neutral-dark mb-1">Admin Username</label>
                    <input type="text" id="adminUsername" value={adminUsername} onChange={(e) => setAdminUsername(e.target.value)} className={commonInputClasses} placeholder="Enter admin username" required />
                </div>
            )}

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-neutral-dark mb-1">Password</label>
              <input type="password" id="password" value={password} onChange={(e) => setPassword(e.target.value)} className={commonInputClasses} placeholder="••••••••" required />
            </div>
            {error && <p className="text-red-500 text-sm text-center">{error}</p>}
            <button type="submit" className={`${buttonClasses} bg-primary text-white hover:bg-blue-700`}>Login</button>
            
            {userType === UserRole.STUDENT && (
                <p className="text-center text-sm text-neutral-DEFAULT">
                New student?{' '}
                <button type="button" onClick={() => { setActiveForm('register'); setError(''); }} className="font-medium text-primary hover:underline">
                    Register here
                </button>
                </p>
            )}
          </form>
        ) : ( // Registration Form (Only for students)
          <form onSubmit={handleRegister} className="space-y-4">
            <h3 className="text-xl font-semibold text-center text-primary mb-4">Student Registration</h3>
             <div>
                <label htmlFor="regStudentId" className="block text-sm font-medium text-neutral-dark mb-1">Student ID</label>
                <input type="text" id="regStudentId" value={regStudentId} onChange={(e) => setRegStudentId(e.target.value)} className={commonInputClasses} required />
              </div>
              <div>
                <label htmlFor="regName" className="block text-sm font-medium text-neutral-dark mb-1">Full Name</label>
                <input type="text" id="regName" value={regName} onChange={(e) => setRegName(e.target.value)} className={commonInputClasses} required />
              </div>
              <div>
                <label htmlFor="regCourse" className="block text-sm font-medium text-neutral-dark mb-1">Course (e.g., BSc CompSci)</label>
                <input type="text" id="regCourse" value={regCourse} onChange={(e) => setRegCourse(e.target.value)} className={commonInputClasses} required />
              </div>
              <div>
                <label htmlFor="regPassword" className="block text-sm font-medium text-neutral-dark mb-1">Password</label>
                <input type="password" id="regPassword" value={regPassword} onChange={(e) => setRegPassword(e.target.value)} className={commonInputClasses} required />
              </div>
              <div>
                <label htmlFor="regConfirmPassword" className="block text-sm font-medium text-neutral-dark mb-1">Confirm Password</label>
                <input type="password" id="regConfirmPassword" value={regConfirmPassword} onChange={(e) => setRegConfirmPassword(e.target.value)} className={commonInputClasses} required />
              </div>
            {error && <p className="text-red-500 text-sm text-center">{error}</p>}
            <button type="submit" className={`${buttonClasses} bg-secondary text-white hover:bg-emerald-700`}>Register</button>
            <p className="text-center text-sm text-neutral-DEFAULT">
              Already have an account?{' '}
              <button type="button" onClick={() => { setActiveForm('login'); setError(''); setUserType(UserRole.STUDENT); }} className="font-medium text-primary hover:underline">
                Login here
              </button>
            </p>
          </form>
        )}
      </div>
    </div>
  );
};

export default LandingPage;
