const express = require('express');
const session = require('express-session');
const app = express();
const port = 3001;
const db = require('./models');

app.use(express.static('public'));
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));


app.use(session({
    secret: 'superSecretKey123',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
}));

// check state

function isLoggedIn(req, res, next) {
    if (!req.session.user) {
        return res.redirect('/');
    }
    next();
}

function isAdmin(req, res, next) {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.send("Unauthorized");
    }
    next();
}

// check state

db.sequelize.sync().then(() => {
    app.listen(port, () => {
        console.log(`Server is running on port ${port}, press Ctrl-C to terminate....`)
    });
});

// USE THIS!!
/*
app.get('/subject-scd', isLoggedIn, async (req, res) => {
    const userId = req.session.user.id;

});
*/

app.get('/', async (req, res) => {

    let user = null;
    let pd = null;
    let sc = null;
    let reg = null;
    let teacher = null;
    if (req.session.user) {
        user = await db.Accounts.findByPk(req.session.user.id);
        pd = await db.PersonalData.findOne({
            where: { account_id: user.account_id }
        });

        sc = await db.Students.findOne({
            where: { account_id: user.account_id }
        });

        reg = await db.RegistrationDepartment.findOne({
            where: { account_id: user.account_id }
        });

        teacher = await db.Teacher.findOne({
            where: { account_id: user.account_id }
        });
        
    }
    res.render('homepage', {user, pd, sc, reg, teacher});
});

app.post('/reto-login', (req, res) => {
    res.render('login');
});

app.post('/login', async (req, res) => {
    let { username, password } = req.body;

    username = username.trim();

    const user = await db.Accounts.findOne({
        where: db.Sequelize.where(
            db.Sequelize.fn('TRIM', db.Sequelize.col('email')),
            username
        )
    });

    if (!user || user.password_hash !== password) {
        return res.send("Email หรือ Password ไม่ถูกต้อง");
    }

    req.session.user = {
        id: user.account_id,
        role: user.role
    };

    if (user.role === 'admin') {
        return res.redirect('/admin');
    }

    return res.redirect('/dashboard');
});

app.post('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/');
    });
});

app.get('/admin', isLoggedIn, isAdmin, async (req, res) => {

    const user = await db.Accounts.findByPk(req.session.user.id);

    const pd = await db.PersonalData.findOne({
        where: { account_id: user.account_id }
    });

    const reg = await db.RegistrationDepartment.findOne({
        where: { account_id: user.account_id }
    });

    res.render('info', { user, pd, reg, sc: null, teacher: null });
});

app.get('/scorestu', isLoggedIn, async (req, res) => {
    try {

        const sessionUser = req.session.user;

        if (!sessionUser) {
            return res.redirect('/');
        }

        if (sessionUser.role !== 'student') {
            return res.status(403).send("Unauthorized");
        }

        const user = await db.Accounts.findByPk(sessionUser.id);
        if (!user) {
            req.session.destroy();
            return res.redirect('/');
        }

        const pd = await db.PersonalData.findOne({
            where: { account_id: user.account_id }
        });

        const sc = await db.Students.findOne({
            where: { account_id: user.account_id }
        });

        if (!sc) {
            return res.status(404).send("ไม่พบข้อมูลนักศึกษา");
        }

        const score = await db.Enrollments.findAll({
            where: { student_code: sc.student_code },
            include: db.Subject
        });

        res.render('score-student', { pd, sc, user, score });

    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
});

app.get('/subject-scd', isLoggedIn, async (req, res) => {

    const user = await db.Accounts.findByPk(req.session.user.id);
    if (!user) return res.redirect('/');

    const pd = await db.PersonalData.findOne({
        where: { account_id: user.account_id }
    });

    let data = [];
    let sc = null;
    let teacher = null;

    if (user.role === 'student') {

        sc = await db.Students.findOne({
            where: { account_id: user.account_id }
        });

        if (!sc) return res.send("ไม่พบข้อมูลนักศึกษา");

        data = await db.Enrollments.findAll({
            where: { student_code: sc.student_code },
            include: [
                {
                    model: db.Subject,
                    include: [db.Classroom, db.SubjectSchedule]
                }
            ]
        });
    }

    if (user.role === 'teacher') {

        teacher = await db.Teacher.findOne({
            where: { account_id: user.account_id }
        });

        if (!teacher) return res.send("ไม่พบข้อมูลอาจารย์");

        data = await db.Enrollments.findAll({
            include: [
                {
                    model: db.Subject,
                    required: true,
                    include: [
                        db.Classroom,
                        db.SubjectSchedule,
                        {
                            model: db.TeacherSubject,
                            required: true,
                            where: { teacher_id: teacher.teacher_id }
                        }
                    ]
                }
            ]
        });
    }

    res.render('subject-scd', { user, pd, sc, teacher, data });
});

app.get('/exam-scd', isLoggedIn, async (req, res) => {

    const user = await db.Accounts.findByPk(req.session.user.id);
    if (!user) return res.send("ไม่พบข้อมูล");

    const sc = await db.Students.findOne({
        where: { account_id: user.account_id }
    });

    const pd = await db.PersonalData.findOne({
        where: { account_id: user.account_id }
    });

    const data = await db.Enrollments.findAll({
        where: { student_code: sc.student_code },
        include: [
            { model: db.Subject, include: [db.Classroom, db.SubjectSchedule] }
        ]
    });

    res.render('exam-scd', { user, sc, data, pd });
});

db.Students.belongsTo(db.Accounts, { foreignKey: 'account_id' });
db.Students.belongsTo(db.PersonalData, { foreignKey: 'account_id' });
db.Teacher.belongsTo(db.Accounts, { foreignKey: 'account_id' });
db.Teacher.belongsTo(db.PersonalData, { foreignKey: 'account_id' });

app.get('/add-student', isLoggedIn, isAdmin, async (req, res) => {

    const user = await db.Accounts.findByPk(req.session.user.id);

    const pd = await db.PersonalData.findOne({
        where: { account_id: user.account_id }
    });

    const reg = await db.RegistrationDepartment.findOne({
        where: { account_id: user.account_id }
    });

    const students = await db.Students.findAll({
        include: [
            { model: db.Accounts, where: { role: 'student' } },
            { model: db.PersonalData }
        ]
    });

    res.render('add-student', { user, pd, reg, students });
});

app.post('/addstudent/:id', async (req, res) => {
    try {
    const {fname, lname, stucode, email, password, gender, dob,phone} = req.body;

        const newAccount = await db.Accounts.create({
            email,
            password_hash: password,
            role: 'student'
        });

        await db.PersonalData.create({
            account_id: newAccount.account_id,
            first_name: fname,
            last_name: lname,
            date_of_birth: dob,
            gender: gender,
            telephone: phone
        });

        await db.Students.create({
            account_id: newAccount.account_id,
            email: email,
            student_code: stucode
        });


        res.redirect(req.get('Referer'));
    } catch (err) {
        console.error(err);
        res.send("เพิ่มข้อมูลไม่สำเร็จ");
    }
});

app.post('/edit-student/:id', async (req, res) => {

    const { fname, lname, email, phone } = req.body;

    const student = await db.Students.findByPk(req.params.id);

    await db.PersonalData.update(
        {
            first_name: fname,
            last_name: lname,
            telephone: phone
        },
        { where: { account_id: student.account_id } }
    );

    await db.Accounts.update(
        { email: email },
        { where: { account_id: student.account_id } }
    );


    res.redirect(req.get('Referer'));
});


app.get('/add-teacher', isLoggedIn, isAdmin, async (req, res) => {
    try {

        const user = await db.Accounts.findByPk(req.session.user.id);
        if (!user) return res.send("ไม่พบข้อมูล");

        const pd = await db.PersonalData.findOne({
            where: { account_id: user.account_id },
        });

        const reg = await db.RegistrationDepartment.findOne({
            where: { account_id: user.account_id }
        });

        const teachers = await db.Teacher.findAll({
            include: [
                {
                    model: db.Accounts,
                    where: { role: 'teacher' },
                },
                {
                    model: db.PersonalData
                }
            ]
        });
        const departments = await db.Department.findAll();

        res.render('add-teacher', { user, pd, reg, teachers ,departments});

    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
});

app.post('/addteacher/:id', async (req, res) => {
    try {

        const {fname, lname, teachercode, departmentid, email, password, gender, dob, phone} = req.body;

        const newAccount = await db.Accounts.create({
            email,
            password_hash: password,
            role: 'teacher'
        });

        await db.PersonalData.create({
            account_id: newAccount.account_id,
            first_name: fname,
            last_name: lname,
            date_of_birth: dob,
            gender: gender,
            telephone: phone
        });

        await db.Teacher.create({
            account_id: newAccount.account_id,
            email: email,
            department_id: departmentid,
            teacher_code: teachercode
        });


        res.redirect(req.get('Referer'));
    } catch (err) {
        console.error(err);
        res.send("เพิ่มข้อมูลไม่สำเร็จ");
    }
});

app.post('/edit-teacher/:id', async (req, res) => {
    try {
        const {fname, lname, email, phone} = req.body;

        const teacher = await db.Teacher.findByPk(req.params.id);
        if (!teacher) return res.send("ไม่พบข้อมูลอาจารย์");

        await db.PersonalData.update(
            {
                first_name: fname,
                last_name: lname,
                telephone: phone
            },
            { where: 
                { 
                    account_id: teacher.account_id 
                } 
            }

        );

        await db.Accounts.update(
            { 
                email: email 
            },
            { 
                where: 
                { 
                    account_id: teacher.account_id 
                } 
            }
        );

        res.redirect(req.get('Referer'));

    } catch (err) {
        console.error(err);
        res.status(500).send("แก้ไขไม่สำเร็จ");
    }
});

app.get('/add-subject-scd', async (req, res) => {
    try {
        const user = await db.Accounts.findByPk(req.session.user.id);
        if (!user) return res.send("ไม่พบข้อมูล");

        const pd = await db.PersonalData.findOne({
            where: 
            { 
                account_id: user.account_id 
            },
        });

        const reg = await db.RegistrationDepartment.findOne({
            where: { account_id: user.account_id }
        });

        const schedules = await db.SubjectSchedule.findAll({
            include: [
                {
                    model: db.Subject,
                    include: [db.Classroom]
                }
            ],
            order: [
                ['section', 'ASC'],
                ['day_of_week', 'ASC'],
                ['start_time', 'ASC']
            ]
        });

        for (let i = 0; i < schedules.length; i++) {
            const section = schedules[i].section;

            if (!sections.includes(section)) {
                sections.push(section);
            }
        }

        let selectedSection;
        if (req.query.section) {
            selectedSection = parseInt(req.query.section);
        } else {
            selectedSection = sections[0];
        }

        res.render('add-subject-scd', {user, pd, reg, schedules, sections, selectedSection});

    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
});

app.get('/add-subject', isLoggedIn, isAdmin, async (req, res) => {
    try {

        const user = await db.Accounts.findByPk(req.session.user.id);
        if (!user) return res.send("ไม่พบข้อมูล");

        const pd = await db.PersonalData.findOne({
            where: { account_id: user.account_id },
        });

        const reg = await db.RegistrationDepartment.findOne({
            where: { account_id: user.account_id }
        });

        const subjects = await db.Subject.findAll({
            include: [
                db.Department,
                db.Classroom,
                {
                    model: db.Teacher,
                    include: [db.PersonalData]
                }
            ]
        });

        const departments = await db.Department.findAll();
        const classrooms = await db.Classroom.findAll();

        const teachers = await db.Teacher.findAll({
            include: [db.PersonalData]
        });

        res.render('add-subject', { 
            user, pd, reg,
            subjects,
            departments,
            classrooms,
            teachers
        });

    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
});

app.post('/add-subject/:id', async (req, res) => {
    try {

        const {
            subject_code,
            subject_name,
            department_id,
            classroom_id,
            year,
            hours,
            teacher_id
        } = req.body;

        const newSubject = await db.Subject.create({
            subject_code,
            subject_name,
            department_id,
            classroom_id,
            year,
            hours
        });

        await db.TeacherSubject.create({
            teacher_id: teacher_id,
            subject_id: newSubject.subject_id
        });

        res.redirect('/add-subject');

    } catch (err) {
        console.error(err);
        res.status(500).send("เพิ่มวิชาไม่สำเร็จ");
    }
});

app.post('/edit-subject/:id', async (req, res) => {
    try {

        const id = req.params.id;

        const { subject_code, subject_name, year, hours, teacher_id } = req.body;

        const subject = await db.Subject.findByPk(id);

        await subject.update({
            subject_code,
            subject_name,
            year,
            hours
        });
        
        await subject.setTeachers([]);

        await subject.addTeacher(teacher_id);

        res.redirect('/add-subject');

    } catch (err) {
        console.error(err);
        res.send("Error updating subject");
    }
});

app.post('/save-section/:subjectId', isLoggedIn, isAdmin, async (req, res) => {
    const t = await db.sequelize.transaction();
    try {
        const subjectId = req.params.subjectId;
        const sections = req.body.sections || [];

        const subject = await db.Subject.findByPk(subjectId, { transaction: t });

        if (!subject) {
            await t.rollback();
            return res.status(404).send("ไม่พบรายวิชา");
        }

        const subjectCode = subject.subject_code;

        await db.SubjectSchedule.destroy({
            where: { subject_id: subjectId },
            transaction: t
        });

        await db.SubjectSection.destroy({
            where: { subject_code: subjectCode },
            transaction: t
        });

        for (let sec of sections) {

            if (!sec.day_of_week) continue;

            await db.SubjectSchedule.create({
                subject_id: subjectId,
                section: sec.section,
                day_of_week: sec.day_of_week,
                start_time: sec.start_time,
                end_time: sec.end_time
            }, { transaction: t });

            await db.SubjectSection.create({
                subject_id: subjectId,
                section: sec.section,
                subject_code: subjectCode
            }, { transaction: t });
        }

        await t.commit();
        res.redirect(req.get('Referer'));

    } catch (err) {
        await t.rollback();
        console.error(err);
        res.status(500).send("บันทึกไม่สำเร็จ");
    }
});

app.get('/get-section/:subjectId', async (req, res) => {
    try {

        const sections = await db.SubjectSchedule.findAll({
            where: { subject_id: req.params.subjectId }
        });

        res.json(sections);

    } catch (err) {
        console.error(err);
    }
});

app.get('/add-studentsec', isLoggedIn, isAdmin, async (req, res) => {
    try {

        const user = await db.Accounts.findByPk(req.session.user.id);
        if (!user) return res.send("ไม่พบข้อมูลนักเรัยน");

        const pd = await db.PersonalData.findOne({
            where: 
            { 
                account_id: user.account_id 
            },
        });

        const reg = await db.RegistrationDepartment.findOne({
            where: 
            { 
                account_id: user.account_id 
            }
        });

        const subjects = await db.Subject.findAll({
            include: [
                {
                    model: db.SubjectSchedule
                }
            ]
        });

        const students = await db.Students.findAll();

        res.render('add-studentsec', {user, pd, reg, subjects, students});

    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
});

app.post('/save-enrollment', async (req, res) => { // i have no idea wtf this is
  try {

    const subject_code = req.body.subject_code;
    const section = parseInt(req.body.section);
    let students = req.body.students;

    if (!students) {
        return res.redirect('back');
    }

    if (!Array.isArray(students)) {
        students = [students];
    }

    const subject = await db.Subject.findOne({
      where: 
      { 
        subject_code 
    }
    });

    if (!subject) {
      return res.send("ไม่พบวิชา");
    }

    const subject_id = subject.subject_id;

    const newSchedules = await db.SubjectSchedule.findAll({
      where: {
        subject_id: subject_id,
        section: section
      }
    });

    for (let student_code of students) {
      const already = await db.Enrollments.findOne({
        where: { student_code, subject_code }
      });

      if (already && already.section != section) {
        return res.send(
          `นักเรียน ${student_code} ลงวิชานี้ไปแล้วใน Section ${already.section}`
        );
      }

      const allEnroll = await db.Enrollments.findAll({
        where: { student_code }
      });

      for (let enroll of allEnroll) {

        const oldSub = await db.Subject.findOne({
          where: { subject_code: enroll.subject_code }
        });

        if (!oldSub) continue;

        const oldSchedules = await db.SubjectSchedule.findAll({
          where: {
            subject_id: oldSub.subject_id,
            section: enroll.section
          }
        });

        for (let newSch of newSchedules) {
          for (let oldSch of oldSchedules) {

            if (newSch.day_of_week === oldSch.day_of_week) {

              if (
                newSch.start_time < oldSch.end_time &&
                newSch.end_time > oldSch.start_time
              ) {
                return res.send(
                  `เวลาเรียนชนกับวิชา ${enroll.subject_code}`
                );
              }
            }
          }
        }
      }

      await db.Enrollments.create({
        student_code,
        subject_code,
        section
      });
    }

    res.redirect(req.get('Referer'));

  } catch (err) {
    console.error(err);
    res.status(500).send(err.message);
  }
});


app.get('/dashboard', isLoggedIn, async (req, res) => {
    const user = await db.Accounts.findByPk(req.session.user.id);
    const pd = await db.PersonalData.findOne({
        where: { account_id: user.account_id }
    });

    let sc = null;
    let teacher = null;
    let reg = null;

    if (user.role === 'student') {
        sc = await db.Students.findOne({
            where: { account_id: user.account_id }
        });
    }

    if (user.role === 'teacher') {
        teacher = await db.Teacher.findOne({
            where: { account_id: user.account_id }
        });
    }

    if (user.role === 'admin') {
        reg = await db.RegistrationDepartment.findOne({
            where: { account_id: user.account_id }
        });
    }

    res.render('info', { user, pd, sc, teacher, reg });
});

/*
app.get('/info/:id', async (req, res) => {
    try {
        const user = await db.Accounts.findByPk(req.params.id);

        if (!user) return res.send("ไม่พบข้อมูล");

        const pd = await db.PersonalData.findOne({
            where: { account_id: user.account_id }
        });

        let sc = null;
        let teacher = null;

        if (user.role === 'student') {
            sc = await db.Students.findOne({
                where: { account_id: user.account_id }
            });
        }

        if (user.role === 'teacher') {
            teacher = await db.Teacher.findOne({
                where: { account_id: user.account_id }
            });
        }

        res.render('info', { user, pd, sc, teacher });

    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
});
*/

app.post('/changepass', isLoggedIn, async (req, res) => {
    const { opass, npass, cnpass } = req.body;

    if (!opass || !npass || !cnpass) {
        return res.redirect('/dashboard');
    }

    try {
        const user = await db.Accounts.findByPk(req.session.user.id);
        if (!user) return res.redirect('/dashboard');

        if (opass !== user.password_hash) {
            return res.redirect('/dashboard');
        }

        if (npass !== cnpass) {
            return res.redirect('/dashboard');
        }

        await user.update({
            password_hash: npass
        });
        res.redirect('/dashboard');

    } catch (err) {
        console.error(err);
    }
});

app.get('/update-score', isLoggedIn, async (req, res) => {
    const user = await db.Accounts.findByPk(req.session.user.id);

    if (!user) return res.send("ไม่พบข้อมูล");

    const pd = await db.PersonalData.findOne({
        where: { account_id: user.account_id }
    });

    const teacher = await db.Teacher.findOne({
        where: { account_id: user.account_id }
    });

    const data = await db.Enrollments.findAll({
        include: [{model: db.Subject,required: true,
            include: [{model: db.TeacherSubject,required: true,
                where: { teacher_id: teacher.teacher_id }}]},{model: db.Students,required: true, 
                    include: [db.PersonalData]}]
    });
    /*
    select * from subject_schedule ss
    inner join subject s on ss.subject_id = s.subject_id
    inner join teachersubject ts on ts.subject_id = s.subject_id and ts.teacher_id = ?
    inner join students st on st.schedule_id = ss.schedule_id
    inner join personaldata pd on pd.student_id = st.student_id;
    */
    res.render('update-score',{pd, user, teacher, data});
});

app.post('/update-score', isLoggedIn, async (req, res) => {
    try {
        const {student_code, subject_code, section, score, midscore, finalscore} = req.body;
        await db.Enrollments.update(
            {
                student_assignment_score: score,
                student_midterm_score: midscore,
                student_final_score: finalscore
            },
            {
                where: 
                {
                    student_code : student_code,
                    subject_code,
                    section
                }
            }
        );

        res.redirect(req.get('Referer'));
    } catch (err) {
        console.error(err);
    }
});

// res.redirect(req.get('Referer')); กลับหน้าเดิม






